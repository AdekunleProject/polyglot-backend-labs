// src/auth/auth.service.ts
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User } from '../user/schemas/user.schema';
import { EmailQueueService } from '../market-edge/email/email-queue.service';
import { LocalRegisterInput, LocalLoginInput, ResetPasswordConfirmInput } from './dto/auth.inputs';
import { Role } from './roles.enum';
import { SocialTokenVerifier } from './social-token-verifier';
import { generateOtp, normalizeEmail } from './otp';

export const MAX_OTP_ATTEMPTS = 5;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
const OTP_MINUTES = 15;

export const REGISTER_MESSAGE =
  'Registration successful. Please check your email for the verification code.';
// The same text whether or not the account exists, so the endpoint cannot be
// used to find out who has an account.
export const RECOVERY_MESSAGE =
  'If an account exists for this email, a code has been sent.';

// Compared against when the user does not exist, so a missing user and a wrong
// password take about the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly jwtService: JwtService,
    private readonly emailQueueService: EmailQueueService,
    private readonly socialVerifier: SocialTokenVerifier,
  ) {}

  async generateTokens(user: User) {
    const base = { sub: String(user._id), username: user.username, role: user.role };
    return {
      accessToken: this.jwtService.sign({ ...base, type: 'access' }, { expiresIn: '15m' }),
      refreshToken: this.jwtService.sign({ ...base, type: 'refresh' }, { expiresIn: '7d' }),
      role: user.role,
    };
  }

  /** Trades a valid refresh token for a new pair. Role and status are re-read from the database. */
  async refreshTokens(refreshToken: string) {
    let payload: { type?: string; sub?: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid refresh token.');

    const user = await this.userModel.findById(payload.sub);
    if (!user || !user.isVerified) throw new UnauthorizedException('Invalid refresh token.');
    return this.generateTokens(user);
  }

  async registerLocal(input: LocalRegisterInput) {
    const email = normalizeEmail(input.email);
    const username = input.username.trim();

    const existing = await this.userModel.findOne({ $or: [{ username }, { email }] });
    if (existing) throw new ConflictException('Username or email already registered.');

    const code = generateOtp();
    const user = await this.userModel.create({
      username,
      email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: Role.CUSTOMER,
      isVerified: false,
      verifyOtpCode: await bcrypt.hash(code, 10),
      verifyOtpExpiresAt: minutesFromNow(OTP_MINUTES),
      verifyOtpAttempts: 0,
    });

    await this.emailQueueService.sendVerificationEmail({
      email: user.email,
      otp: code,
    });
    return REGISTER_MESSAGE;
  }

  async resendVerification(email: string): Promise<string> {
    const user = await this.userModel.findOne({ email: normalizeEmail(email) });
    if (user && !user.isVerified) {
      const code = generateOtp();
      await this.userModel.updateOne(
        { _id: user._id },
        {
          $set: {
            verifyOtpCode: await bcrypt.hash(code, 10),
            verifyOtpExpiresAt: minutesFromNow(OTP_MINUTES),
            verifyOtpAttempts: 0,
          },
        },
      );
      await this.emailQueueService.sendVerificationEmail({
        email: user.email,
        otp: code,
      });
    }
    return RECOVERY_MESSAGE;
  }

  async verifyEmailOtp(email: string, otp: string): Promise<boolean> {
    const user = await this.userModel.findOne({ email: normalizeEmail(email) });
    if (!user || !user.verifyOtpCode || !user.verifyOtpExpiresAt) {
      throw new BadRequestException('No active verification session.');
    }
    if ((user.verifyOtpAttempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Too many wrong codes. Request a new code.');
    }
    if (new Date() > user.verifyOtpExpiresAt) {
      throw new BadRequestException('Verification code expired.');
    }

    const isValid = await bcrypt.compare(otp.trim().toUpperCase(), user.verifyOtpCode);
    if (!isValid) {
      await this.userModel.updateOne({ _id: user._id }, { $inc: { verifyOtpAttempts: 1 } });
      throw new UnauthorizedException('Invalid verification code.');
    }

    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: { isVerified: true, verifyOtpAttempts: 0 },
        $unset: { verifyOtpCode: '', verifyOtpExpiresAt: '' },
      },
    );
    return true;
  }

  async loginLocal(input: LocalLoginInput) {
    const user = await this.userModel.findOne({ username: input.username.trim() });
    if (!user || !user.passwordHash) {
      await bcrypt.compare(input.password, DUMMY_HASH);
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked. Try again later.');
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      await this.registerFailedLogin(user);
      throw new UnauthorizedException('Invalid credentials.');
    }

    // Checked only after the password, so it is not shown to someone who just guesses names.
    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your email via OTP first.');
    }

    if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {
      await this.userModel.updateOne(
        { _id: user._id },
        { $set: { failedLoginAttempts: 0 }, $unset: { lockedUntil: '' } },
      );
    }
    return this.generateTokens(user);
  }

  private async registerFailedLogin(user: User): Promise<void> {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const update =
      attempts >= MAX_LOGIN_ATTEMPTS
        ? { failedLoginAttempts: 0, lockedUntil: minutesFromNow(LOCK_MINUTES) }
        : { failedLoginAttempts: attempts };
    await this.userModel.updateOne({ _id: user._id }, { $set: update });
  }

  async forgotPasswordLoop(email: string): Promise<string> {
    const normalized = normalizeEmail(email);
    const user = await this.userModel.findOne({ email: normalized });

    if (user) {
      const code = generateOtp();
      await this.userModel.updateOne(
        { _id: user._id },
        {
          $set: {
            resetOtpCode: await bcrypt.hash(code, 10),
            resetOtpExpiresAt: minutesFromNow(OTP_MINUTES),
            resetOtpAttempts: 0,
          },
        },
      );
      await this.emailQueueService.sendPasswordResetEmail({
        email: normalized,
        otp: code,
      });
    }
    return RECOVERY_MESSAGE;
  }

  async verifyResetAndMutatePassword(input: ResetPasswordConfirmInput): Promise<boolean> {
    const user = await this.userModel.findOne({ email: normalizeEmail(input.email) });
    if (!user || !user.resetOtpCode || !user.resetOtpExpiresAt) {
      throw new BadRequestException('Invalid recovery session.');
    }
    if ((user.resetOtpAttempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Too many wrong codes. Request a new code.');
    }
    if (new Date() > user.resetOtpExpiresAt) {
      throw new BadRequestException('Recovery code expired.');
    }

    const isMatch = await bcrypt.compare(input.otpCode.trim().toUpperCase(), user.resetOtpCode);
    if (!isMatch) {
      await this.userModel.updateOne({ _id: user._id }, { $inc: { resetOtpAttempts: 1 } });
      throw new UnauthorizedException('Invalid verification code.');
    }

    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: await bcrypt.hash(input.newPassword, 12),
          resetOtpAttempts: 0,
          failedLoginAttempts: 0,
        },
        $unset: { resetOtpCode: '', resetOtpExpiresAt: '', lockedUntil: '' },
      },
    );
    return true;
  }

  async loginWithProvider(provider: 'google' | 'apple', idToken: string) {
    const identity =
      provider === 'google'
        ? await this.socialVerifier.verifyGoogle(idToken)
        : await this.socialVerifier.verifyApple(idToken);

    const email = normalizeEmail(identity.email);
    const idField = provider === 'google' ? 'googleId' : 'appleId';

    let user = await this.userModel.findOne({
      $or: [{ [idField]: identity.providerId }, { email }],
    });

    if (!user) {
      const local = email.split('@')[0].replace(/[^a-z0-9._-]/g, '').slice(0, 30) || 'user';
      user = await this.userModel.create({
        username: `${local}-${randomBytes(3).toString('hex')}`,
        email,
        role: Role.CUSTOMER,
        isVerified: true,
        [idField]: identity.providerId,
      });
    } else if (!user[idField] || !user.isVerified) {
      // The provider has verified this email address, so linking by email is safe.
      user[idField] = user[idField] ?? identity.providerId;
      user.isVerified = true;
      await user.save();
    }

    return this.generateTokens(user);
  }
}
