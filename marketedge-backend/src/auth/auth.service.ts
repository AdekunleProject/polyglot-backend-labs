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
import * as bcrypt from 'bcrypt';
import { User } from '../user/schemas/user.schema';
import { EmailQueueService } from '../market-edge/email/email-queue.service';
import { LocalRegisterInput, LocalLoginInput, ResetPasswordConfirmInput, ChangePasswordInput, } 
from './dto/auth.inputs';
import { Role } from './enum/roles.enum';
import { SocialTokenVerifier } from './social-token-verifier';
import { generateOtp, normalizeEmail } from './otp';
import { createHash, randomBytes, randomUUID } from 'crypto';

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

    private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private createTokenPair(user: User, sessionId: string) {
    const base = {
      sub: String(user._id),
      username: user.username,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(
      { ...base, type: 'access', sid: sessionId },
      { expiresIn: '15m' },
    );

    const refreshToken = this.jwtService.sign(
      { ...base, type: 'refresh', sid: sessionId, jti: randomUUID() },
      { expiresIn: '7d' },
    );

    return { accessToken, refreshToken, role: user.role };
  }

  async generateTokens(user: User) {
    const sessionId = randomUUID();
    const tokens = this.createTokenPair(user, sessionId);
    const now = new Date();
    // Remove expired sessions before adding this new device session.
    await this.userModel.updateOne(
      { _id: user._id },
      { $pull: { refreshSessions: { expiresAt: { $lte: now } } } },
    );
    await this.userModel.updateOne(
      { _id: user._id },
      {
        $push: {
          refreshSessions: {
            sessionId,
            tokenHash: this.hashRefreshToken(tokens.refreshToken),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            createdAt: now,
            lastUsedAt: now,
          },
        },
      },
    );

    return tokens;
  }

  /** Rotates a refresh token; the previous token becomes unusable. */
  async refreshTokens(refreshToken: string) {
    let payload: { type?: string; sub?: string; sid?: string };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (payload.type !== 'refresh' || !payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const user = await this.userModel.findById(payload.sub);

    if (!user || !user.isVerified) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const now = new Date();
    const oldHash = this.hashRefreshToken(refreshToken);
    const tokens = this.createTokenPair(user, payload.sid);
    const newHash = this.hashRefreshToken(tokens.refreshToken);

    // Compare-and-swap: only the request holding the currently stored token
    // hash can rotate this session.
    const result = await this.userModel.updateOne(
      {
        _id: user._id,
        refreshSessions: {
          $elemMatch: {
            sessionId: payload.sid,
            tokenHash: oldHash,
            expiresAt: { $gt: now },
          },
        },
      },
      {
        $set: {
          'refreshSessions.$.tokenHash': newHash,
          'refreshSessions.$.expiresAt': new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ),
          'refreshSessions.$.lastUsedAt': now,
        },
      },
    );

    if (result.modifiedCount !== 1) {
      // A previously rotated token was reused. Revoke that device session.
      await this.userModel.updateOne(
        { _id: user._id },
        { $pull: { refreshSessions: { sessionId: payload.sid } } },
      );

      throw new UnauthorizedException('Invalid refresh token.');
    }

    return tokens;
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
          refreshSessions: [],
        },
        $unset: { resetOtpCode: '', resetOtpExpiresAt: '', lockedUntil: '' },
      },
    );
    return true;
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
  ): Promise<boolean> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Invalid user session.');
    }

    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account does not have a password. Please use your social login provider.',
      );
    }

    const isMatch = await bcrypt.compare(
      input.currentPassword,
      user.passwordHash,
    );

    if (!isMatch) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException(
        'Your new password must be different from your current password.',
      );
    }

    const newPasswordHash = await bcrypt.hash(input.newPassword, 12);
    const result = await this.userModel.updateOne(
      {
        _id: user._id,
        passwordHash: user.passwordHash,
      },
      {
        $set: {
          passwordHash: newPasswordHash,
          refreshSessions: [],
          failedLoginAttempts: 0,
        },
        $unset: {
          lockedUntil: '',
        },
      },
    );
    if (result.modifiedCount !== 1) {
      throw new UnauthorizedException(
        'Password could not be changed. Please try again.',
      );
    }
    return true;
  };

  async logout(userId: string, sessionId: string): Promise<boolean> {
    if (!sessionId) {
      throw new UnauthorizedException('Invalid user session.');
    }

    const result = await this.userModel.updateOne(
      { _id: userId },
      { $pull: { refreshSessions: { sessionId } } },
    );

    if (result.matchedCount !== 1) {
      throw new UnauthorizedException('Invalid user session.');
    }

    return true;
  }

  async logoutAll(userId: string): Promise<boolean> {
    const result = await this.userModel.updateOne(
      { _id: userId },
      { $set: { refreshSessions: [] } },
    );

    if (result.matchedCount !== 1) {
      throw new UnauthorizedException('Invalid user session.');
    }

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
