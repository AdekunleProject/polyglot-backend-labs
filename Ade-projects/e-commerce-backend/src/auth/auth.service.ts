import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from '../users/schemas/user.schema';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { SignupDto } from '../auth/dto/signup.dto';
import { LoginDto } from '../auth/dto/login.dto';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto';
import { VerifyPasswordDto } from './dto/verify-password.dto';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { MailService } from '../helpers/mail/mail-service';
import { MailToken, MailTokenPurpose } from '../users/schemas/mail.schema';
import { Role } from 'src/common/enums/role.enum';
import { FileUpload } from 'src/aws/aws.file-upload';
import { AuthProvider } from 'src/common/enums/auth-provider.enum';
import { ProfileImageProvider } from '../common/enums/profile-image-provider.enum';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { hashToken, sameHash } from './token-hash';
import { generateVerificationCode, hashCode } from './verification-code';
import { TwoFactorService } from './two-factor/two-factor.service';
import { TwoFactorLoginDto } from './two-factor/dto/two-factor.dto';
import { NotificationsService } from 'src/notifications/notification.service';
import { NotificationType } from 'src/notifications/schemas/notification.schema';

const BCRYPT_ROUNDS = 12;
const CODE_TTL_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(MailToken.name) private mailTokenModel: Model<MailToken>,
    private configService: ConfigService,
    private jwtService: JwtService,
    private mailService: MailService,
    private readonly fileUpload: FileUpload,
    private readonly notificationsService: NotificationsService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  // Compared against when the email is unknown, so a login for a real account
  // and one for a made-up address take about the same time.
  private readonly dummyHash = bcrypt.hash('not-a-real-password', BCRYPT_ROUNDS);

  // Token lifetimes come from the environment (JWT_EXPIRES_IN and
  // JWT_REFRESH_EXPIRES_IN). They used to be hard-coded to 15m and 30d, so
  // changing the settings had no effect.
  private get accessTokenTtl(): JwtSignOptions['expiresIn'] {
    return (this.configService.get<string>('JWT_EXPIRES_IN') ??
      '15m') as JwtSignOptions['expiresIn'];
  }

  private get refreshTokenTtl(): JwtSignOptions['expiresIn'] {
    return (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      '7d') as JwtSignOptions['expiresIn'];
  }

  // A user may be signed in on several devices. Each device has a session with
  // its own refresh token. The most sessions kept per user; the oldest is dropped.
  private static readonly MAX_SESSIONS = 5;

  private signRefreshToken(userId: string, sid: string): Promise<string> {
    return this.jwtService.signAsync(
      // jti makes every token unique, even when issued in the same second.
      { sub: userId, sid, type: 'refresh', jti: crypto.randomUUID() },
      {
        secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.refreshTokenTtl,
      },
    );
  }

  private async startSession(userId: string): Promise<string> {
    const sid = crypto.randomUUID();
    const refreshToken = await this.signRefreshToken(userId, sid);
    await this.userModel.updateOne(
      { _id: userId },
      {
        $push: {
          sessions: {
            $each: [
              {
                sid,
                tokenHash: hashToken(refreshToken),
                createdAt: new Date(),
                lastUsedAt: new Date(),
              },
            ],
            $slice: -AuthService.MAX_SESSIONS,
          },
        },
      },
    );
    return refreshToken;
  }

  private async readRefreshToken(
    token: string,
  ): Promise<{ sub: string; sid: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub?: string;
        sid?: string;
        type?: string;
      }>(token, {
        secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      });
      if (!payload.sub || !payload.sid || payload.type !== 'refresh') {
        throw new Error('not a refresh token');
      }
      return { sub: payload.sub, sid: payload.sid };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async resolveProfileImage(user: User): Promise<string | undefined> {
    if (!user.profileImage) {
      return undefined;
    }
    if (user.profileImageProvider === ProfileImageProvider.GOOGLE) {
      return user.profileImage;
    }
    return this.fileUpload.getDownloadUrl(user.profileImage);
  }

  private signAccessToken(user: User): Promise<string> {
    return this.jwtService.signAsync(
      { sub: user._id.toString(), email: user.email, role: user.role },
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.accessTokenTtl,
      },
    );
  }

  // Makes a fresh code for one purpose, replacing any earlier one, stores only
  // its hash, and emails it.
  private async sendCode(
    user: User,
    purpose: MailTokenPurpose,
    subject: string,
    describe: (code: string) => string,
  ) {
    const code = generateVerificationCode();
    await this.mailTokenModel.deleteMany({ userId: user._id, purpose });
    await new this.mailTokenModel({
      userId: user._id,
      purpose,
      token: hashCode(user._id.toString(), purpose, code),
      expiryDate: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
    }).save();
    await this.mailService.sendEmail(user.email, subject, describe(code));
  }

  // True once, for the right code, in time. Deleting is the check, so two
  // requests with the same code cannot both succeed.
  private async consumeCode(
    user: User,
    purpose: MailTokenPurpose,
    code: string,
  ): Promise<boolean> {
    const found = await this.mailTokenModel.findOneAndDelete({
      userId: user._id,
      purpose,
      token: hashCode(user._id.toString(), purpose, code),
      expiryDate: { $gt: new Date() },
    });
    return !!found;
  }

  async signup(signupDto: SignupDto, image?: Express.Multer.File) {
    try {
      const existingUser = await this.userModel.findOne({
        email: signupDto.email,
      });
      if (existingUser) {
        throw new BadRequestException('email already in use');
      }
      let profileImage: string | undefined;
      if (image) {
        profileImage = await this.fileUpload.uploadFile(image, 'users');
      }
      const hashedPassword = await bcrypt.hash(
        signupDto.password,
        BCRYPT_ROUNDS,
      );
      const user = new this.userModel({
        firstname: signupDto.firstname,
        middlename: signupDto.middlename,
        lastname: signupDto.lastname,
        address: signupDto.address,
        email: signupDto.email,
        phoneNumber: signupDto.phoneNumber,
        password: hashedPassword,
        gender: signupDto.gender,
        dateOfBirth: signupDto.dateOfBirth,
        // emergencyContact: signupDto.emergencyContact,
        // role: Role.CUSTOMER,
        profileImage,
        profileImageProvider: profileImage
          ? ProfileImageProvider.S3
          : undefined,
        provider: AuthProvider.LOCAL,
      });
      const savedUser = await user.save();

      await this.notificationsService.notifyUser(
        savedUser._id,
        NotificationType.USER_SIGNUP,
        'Welcome to Duka',
        `Welcome, ${savedUser.firstname}! Verify your email to get started.`,
      );

      const { password, ...userData } = savedUser.toObject();
      const resolvedProfileImage = await this.resolveProfileImage(savedUser);
      await this.sendCode(
        savedUser,
        MailTokenPurpose.VERIFY_EMAIL,
        'Verify your email',
        (code) =>
          `Your verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
      );
      return {
        message: 'Thank you for signing up. Please verify your email.',
        customer: {
          ...userData,
          profileImage: resolvedProfileImage,
        },
      };
    } catch (error) {
      console.log(error, 'Error occurred during signup');
      throw error;
    }
  }

  async googleLogin(googleUser: {
    googleId: string;
    email: string;
    firstname: string;
    lastname: string;
    image?: string;
  }) {
    let user = await this.userModel.findOne({
      email: googleUser.email,
    });

    if (!user) {
      user = new this.userModel({
        firstname: googleUser.firstname,
        lastname: googleUser.lastname,
        email: googleUser.email,
        googleId: googleUser.googleId,
        provider: AuthProvider.GOOGLE,
        // role: Role.CUSTOMER,
        isVerified: true,
      });

      if (googleUser.image) {
        user.profileImage = googleUser.image;
        user.profileImageProvider = ProfileImageProvider.GOOGLE;
      }

      await user.save();
    } else {
      let updated = false;

      if (!user.googleId) {
        user.googleId = googleUser.googleId;
        updated = true;
      }

      if (!user.googleId) {
        user.googleId = googleUser.googleId;
        updated = true;
      }

      if (!user.profileImage && googleUser.image) {
        user.profileImage = googleUser.image;
        user.profileImageProvider = ProfileImageProvider.GOOGLE;
        updated = true;
      }

      if (!user.isVerified) {
        user.isVerified = true;
        updated = true;
      }

      if (updated) {
        await user.save();
      }
    }

    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.startSession(user._id.toString());
    const profileImage = await this.resolveProfileImage(user);
    return {
      refreshToken,
      accessToken,
      user: {
        id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        profileImage,
        role: user.role,
      },
    };
  }

  async verifyUser(email: string, code: string) {
    const user = await this.userModel.findOne({ email });
    // The same answer whether the email is unknown or the code is wrong.
    if (
      !user ||
      !(await this.consumeCode(user, MailTokenPurpose.VERIFY_EMAIL, code))
    ) {
      throw new BadRequestException('Invalid or expired verification code');
    }
    user.isVerified = true;
    await user.save();
    return { message: 'Email verified successfully' };
  }

  async resendVerification(email: string) {
    const user = await this.userModel.findOne({ email });
    if (user && !user.isVerified) {
      await this.sendCode(
        user,
        MailTokenPurpose.VERIFY_EMAIL,
        'Verify your email',
        (code) =>
          `Your verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
      );
    }
    // Same answer either way, so this cannot be used to find registered emails.
    return {
      message:
        'If that email has an account waiting for verification, a new code has been sent.',
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.userModel.findOne({ email }).select('+password');
    // Always compare against a hash: unknown email, Google-only account (no
    // password) and wrong password are all the same answer and take the same time.
    const matches = await bcrypt.compare(
      password,
      user?.password || (await this.dummyHash),
    );
    if (!user || !user.password || !matches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
    }
    if (user.twoFactorEnabled) {
      // Password was right, but no tokens until the second factor is too.
      return {
        twoFactorRequired: true as const,
        challengeToken: await this.twoFactor.createChallenge(user),
        message:
          'Enter the code from your authenticator app at POST /auth/2fa/login.',
      };
    }
    return this.issueTokens(user);
  }

  async loginWithTwoFactor(dto: TwoFactorLoginDto) {
    const user = await this.twoFactor.verifyLogin(
      dto.email,
      dto.challengeToken,
      dto.code,
    );
    return this.issueTokens(user);
  }

  /** Deactivated and deleted accounts cannot sign in or keep a session. */
  private assertAccountUsable(user: User) {
    if (user.deactivatedAt || user.deletedAt) {
      throw new UnauthorizedException('This account is not available');
    }
  }

  private async issueTokens(user: User) {
    this.assertAccountUsable(user);
    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.startSession(user._id.toString());

    await this.notificationsService.notifyUser(
      user._id,
      NotificationType.USER_LOGIN,
      'New sign-in',
      `You signed in to your account on ${new Date().toLocaleString()}.`,
    );

    const profileImage = await this.resolveProfileImage(user);
    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        profileImage,
        role: user.role,
      },
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    const { sub, sid } = await this.readRefreshToken(dto.refreshToken);
    const presented = hashToken(dto.refreshToken);

    const user = await this.userModel
      .findOne({ _id: sub, 'sessions.sid': sid })
      .select('+sessions');
    const session = user?.sessions.find((s) => s.sid === sid);
    if (!user || !session) {
      throw new UnauthorizedException('Session not found');
    }
    this.assertAccountUsable(user);

    // A valid, signed token that is not the current one for this session was
    // already used. Either the real user or a thief has an old copy, so end
    // the session and make everybody sign in again.
    if (!sameHash(session.tokenHash, presented)) {
      await this.endSession(user._id.toString(), sid);
      throw new UnauthorizedException(
        'Refresh token was already used. Please sign in again.',
      );
    }

    // Swap in the new token only if the stored hash is still the one we just
    // checked. If two requests present the same token at once, only one wins.
    const refreshToken = await this.signRefreshToken(user._id.toString(), sid);
    const swapped = await this.userModel.updateOne(
      {
        _id: user._id,
        sessions: { $elemMatch: { sid, tokenHash: presented } },
      },
      {
        $set: {
          'sessions.$.tokenHash': hashToken(refreshToken),
          'sessions.$.lastUsedAt': new Date(),
        },
      },
    );
    if (swapped.modifiedCount !== 1) {
      await this.endSession(user._id.toString(), sid);
      throw new UnauthorizedException(
        'Refresh token was already used. Please sign in again.',
      );
    }

    const accessToken = await this.signAccessToken(user);

    return { accessToken, refreshToken };
  }

  private async endSession(userId: string, sid: string) {
    await this.userModel.updateOne(
      { _id: userId },
      { $pull: { sessions: { sid } } },
    );
  }

  async forgotPassword(email: string) {
    const user = await this.userModel.findOne({ email });
    if (user) {
      await this.sendCode(
        user,
        MailTokenPurpose.RESET_PASSWORD,
        'Reset your password',
        (code) =>
          `Your password reset code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
      );
    }
    // Same answer for a real account and an unknown one, so this endpoint
    // cannot be used to find out which emails are registered.
    return {
      message: 'If that email is registered, a reset code has been sent.',
    };
  }

  private get resetSecret(): string {
    return `${this.configService.getOrThrow<string>('JWT_SECRET')}:password-reset`;
  }

  // Changes whenever the password does, so a reset session works only once.
  private passwordVersion(passwordHash: string | undefined): string {
    return hashToken(passwordHash ?? '').slice(0, 16);
  }

  // Step 2 of a reset: the emailed code, together with the email it was sent
  // to, is exchanged for a 10 minute reset session.
  async verifyPasswordResetOtp(dto: VerifyPasswordDto) {
    const user = await this.userModel
      .findOne({ email: dto.email })
      .select('+password');
    if (
      !user ||
      !(await this.consumeCode(user, MailTokenPurpose.RESET_PASSWORD, dto.code))
    ) {
      throw new BadRequestException('Invalid or expired code');
    }
    const resetToken = await this.jwtService.signAsync(
      {
        sub: user._id.toString(),
        type: 'password_reset',
        pv: this.passwordVersion(user.password),
      },
      { secret: this.resetSecret, expiresIn: '10m' },
    );
    return {
      message: 'Password reset code verified. Now set a new password.',
      resetToken,
    };
  }

  // Step 3: the new password, with the reset session from step 2.
  async resetPassword(dto: ResetPasswordDto, resetToken: string) {
    // Checked first, so a typo does not cost the person their reset session.
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }
    const invalid = new UnauthorizedException(
      'Invalid or expired password reset session',
    );
    let payload: { sub?: string; type?: string; pv?: string };
    try {
      payload = await this.jwtService.verifyAsync(resetToken, {
        secret: this.resetSecret,
      });
    } catch {
      throw invalid;
    }
    if (typeof payload.sub !== 'string' || payload.type !== 'password_reset') {
      throw invalid;
    }
    const user = await this.userModel
      .findById(payload.sub)
      .select('+password');
    if (!user || payload.pv !== this.passwordVersion(user.password)) {
      throw invalid;
    }
    user.password = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    // The code came from the inbox, which proves the address is theirs.
    user.isVerified = true;
    await user.save();
    // A new password signs the account out everywhere.
    await this.userModel.updateOne({ _id: user._id }, { $set: { sessions: [] } });
    return { message: 'Password reset successfully' };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      // This device only. The filter on userId means a token can only ever
      // end one of the caller's own sessions.
      const { sid } = await this.readRefreshToken(refreshToken).catch(() => ({
        sid: undefined,
      }));
      if (sid) {
        await this.endSession(userId, sid);
      }
    } else {
      await this.userModel.updateOne({ _id: userId }, { $set: { sessions: [] } });
    }

    await this.notificationsService.notifyUser(
      userId,
      NotificationType.USER_LOGOUT,
      'Signed out',
      `You signed out on ${new Date().toLocaleString()}.`,
    );

    return {
      message: 'Logged out successfully',
    };
  }
}
