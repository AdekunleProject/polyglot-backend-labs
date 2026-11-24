import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, MoreThan, Not, Repository } from 'typeorm';
import { RealtimeService } from '../realtime/realtime.service';
import { FileUpload } from '../aws/aws.file-upload';
import { AuthProvider } from '../common/enums/auth-provider.enum';
import { ProfileImageProvider } from '../common/enums/profile-image-provider.enum';
import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  BCRYPT_SALT_ROUNDS,
  CODE_TTL_MINUTES,
  MAX_SESSIONS,
} from './auth.constant';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { uniqueUsername } from '../users/username';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { MailToken, MailTokenPurpose } from './entities/mail-token.entity';
import { Session } from './entities/session.entity';
import { TwoFactorLoginDto } from './two-factor/dto/two-factor.dto';
import { TwoFactorService } from './two-factor/two-factor.service';
import { GoogleProfile } from './google.strategy';
import { hashToken } from './token-hash';
import { generateVerificationCode, hashCode } from './verification-code';
import { VerifyPasswordDto } from './dto/verify-password.dto';

const INVALID_CODE = 'Invalid or expired code';

@Injectable()
export class AuthService {
  // Compared against when the email is unknown, so a login for a missing
  // account takes as long as one for a real account.
  private dummyHash?: Promise<string>;

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    @InjectRepository(MailToken)
    private readonly mailTokensRepository: Repository<MailToken>,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly fileUpload: FileUpload,
    private readonly usersService: UsersService,
    private readonly twoFactor: TwoFactorService,
    private readonly realtime: RealtimeService,
  ) {}

  // Token lifetimes come from the environment.
  private get accessTokenTtl(): JwtSignOptions['expiresIn'] {
    return (this.config.get<string>('JWT_EXPIRES_IN') ??
      '15m') as JwtSignOptions['expiresIn'];
  }

  private get refreshTokenTtl(): JwtSignOptions['expiresIn'] {
    return (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      '7d') as JwtSignOptions['expiresIn'];
  }

  private signAccessToken(user: Pick<User, 'id' | 'email' | 'role'>, sid: string) {
    return this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: user.role, sid },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.accessTokenTtl,
      },
    );
  }

  private signRefreshToken(userId: number, sid: string) {
    return this.jwtService.signAsync(
      // jti makes every token unique, even when issued in the same second.
      { sub: userId, sid, type: 'refresh', jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.refreshTokenTtl,
      },
    );
  }

  // A user can be signed in on several devices. Each has a session row with
  // its own refresh token (stored as a hash). The oldest is dropped past the limit.
  private async startSession(
    userId: number,
    deviceName?: string,
  ): Promise<{ refreshToken: string; sid: string }> {
    const sid = randomUUID();
    const refreshToken = await this.signRefreshToken(userId, sid);
    await this.sessionsRepository.insert({
      id: sid,
      userId,
      tokenHash: hashToken(refreshToken),
      deviceName: deviceName?.trim() || null,
    });

    const sessions = await this.sessionsRepository.find({
      where: { userId },
      order: { lastUsedAt: 'DESC', createdAt: 'DESC' },
      select: { id: true },
    });
    const surplus = sessions.slice(MAX_SESSIONS).map((s) => s.id);
    if (surplus.length > 0) {
      await this.sessionsRepository.delete({ id: In(surplus) });
      surplus.forEach((id) => this.realtime.disconnectSession(id));
    }
    return { refreshToken, sid };
  }

  private async readRefreshToken(
    token: string,
  ): Promise<{ sub: number; sid: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub?: number;
        sid?: string;
        type?: string;
      }>(token, { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') });
      if (
        typeof payload.sub !== 'number' ||
        !payload.sid ||
        payload.type !== 'refresh'
      ) {
        throw new Error('not a refresh token');
      }
      return { sub: payload.sub, sid: payload.sid };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async issueTokens(user: User, deviceName?: string) {
    const { refreshToken, sid } = await this.startSession(user.id, deviceName);
    return {
      accessToken: await this.signAccessToken(user, sid),
      refreshToken,
      user: await this.usersService.toPublic(user),
    };
  }

  /** For sign-in paths that live in other modules (device link, phone code). */
  signInDevice(user: User, deviceName?: string) {
    return this.issueTokens(user, deviceName);
  }

  // Creates, stores (hashed) and emails a code. Any older code for the same
  // purpose stops working.
  private async sendCode(user: User, purpose: MailTokenPurpose) {
    const code = generateVerificationCode();
    await this.mailTokensRepository.delete({ userId: user.id, purpose });
    await this.mailTokensRepository.insert({
      userId: user.id,
      purpose,
      tokenHash: hashCode(user.id, purpose, code),
      expiryDate: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
    });
    const [subject, text] =
      purpose === MailTokenPurpose.VERIFY_EMAIL
        ? [
            'Verify your email',
            `Your verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
          ]
        : [
            'Reset your password',
            `Your password reset code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
          ];
    await this.mailService.sendEmail(user.email, subject, text);
  }

  // Deleting is the check: it succeeds for exactly one request, so a code
  // works once even if two requests race.
  private async consumeCode(
    userId: number,
    purpose: MailTokenPurpose,
    code: string,
  ): Promise<boolean> {
    const result = await this.mailTokensRepository.delete({
      userId,
      purpose,
      tokenHash: hashCode(userId, purpose, code),
      expiryDate: MoreThan(new Date()),
    });
    return result.affected === 1;
  }

  async register(dto: RegisterDto, image?: Express.Multer.File) {
    if (await this.usersRepository.findOneBy({ email: dto.email })) {
      throw new ConflictException('Email already in use');
    }
    if (await this.usersRepository.findOneBy({ username: dto.username })) {
      throw new ConflictException('Username already taken');
    }
    const profileImage = image
      ? await this.fileUpload.uploadFile(image, 'users')
      : null;

    const user = await this.usersRepository.save(
      this.usersRepository.create({
        firstname: dto.firstname,
        middlename: dto.middlename ?? null,
        lastname: dto.lastname,
        username: dto.username,
        email: dto.email,
        password: await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS),
        phoneNumber: dto.phoneNumber ?? null,
        dateOfBirth: dto.dateOfBirth ?? null,
        gender: dto.gender ?? null,
        address: dto.address ?? null,
        profileImage,
        profileImageProvider: profileImage ? ProfileImageProvider.S3 : null,
        provider: AuthProvider.LOCAL,
      }),
    );
    await this.sendCode(user, MailTokenPurpose.VERIFY_EMAIL);

    return {
      message: 'Thank you for signing up. Please verify your email.',
      user: await this.usersService.toPublic(user),
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.usersRepository.findOneBy({ email: dto.email });
    if (
      !user ||
      !(await this.consumeCode(user.id, MailTokenPurpose.VERIFY_EMAIL, dto.code))
    ) {
      throw new BadRequestException(INVALID_CODE);
    }
    await this.usersRepository.update(user.id, { isVerified: true });
    return { message: 'Email verified successfully' };
  }

  async resendVerification(email: string) {
    const user = await this.usersRepository.findOneBy({ email });
    if (user && !user.isVerified) {
      await this.sendCode(user, MailTokenPurpose.VERIFY_EMAIL);
    }
    // Same answer either way, so this cannot be used to find registered emails.
    return {
      message: 'If that email needs verifying, a new code has been sent.',
    };
  }

  async login(dto: LoginDto) {
    // password is select:false, so it is asked for explicitly here
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    this.dummyHash ??= bcrypt.hash('not-a-real-password', BCRYPT_SALT_ROUNDS);
    const valid = await bcrypt.compare(
      dto.password,
      user?.password ?? (await this.dummyHash),
    );
    // One message for an unknown email, a wrong password and a Google-only
    // account, so attackers cannot tell which emails exist.
    if (!user || !user.password || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
    }
    if (!user.isActive) {
      throw new ForbiddenException('This account has been deactivated');
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
    return this.issueTokens(user, dto.deviceName);
  }

  async loginWithTwoFactor(dto: TwoFactorLoginDto) {
    const user = await this.twoFactor.verifyLogin(
      dto.email,
      dto.challengeToken,
      dto.code,
    );
    return this.issueTokens(user, dto.deviceName);
  }

  async googleLogin(profile: GoogleProfile) {
    let user = await this.usersRepository.findOneBy({ email: profile.email });

    if (!user) {
      user = await this.usersRepository.save(
        this.usersRepository.create({
          firstname: profile.firstname,
          lastname: profile.lastname,
          username: await uniqueUsername(this.usersRepository, profile.email.split('@')[0]),
          email: profile.email,
          googleId: profile.googleId,
          provider: AuthProvider.GOOGLE,
          isVerified: true,
          profileImage: profile.image ?? null,
          profileImageProvider: profile.image ? ProfileImageProvider.GOOGLE : null,
        }),
      );
    } else {
      if (!user.isActive) {
        throw new ForbiddenException('This account has been deactivated');
      }
      // Existing account with the same email: link Google to it. The email is
      // verified by Google (the strategy checks), so the account counts as verified.
      let changed = false;
      if (!user.googleId) {
        user.googleId = profile.googleId;
        changed = true;
      }
      if (!user.isVerified) {
        user.isVerified = true;
        changed = true;
      }
      if (!user.profileImage && profile.image) {
        user.profileImage = profile.image;
        user.profileImageProvider = ProfileImageProvider.GOOGLE;
        changed = true;
      }
      if (changed) await this.usersRepository.save(user);
    }
    return this.issueTokens(user);
  }

  async refresh(dto: RefreshTokenDto) {
    const { sub, sid } = await this.readRefreshToken(dto.refreshToken);
    const presented = hashToken(dto.refreshToken);

    const user = await this.usersRepository.findOneBy({ id: sub });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Session not found');
    }

    // Swap in the new token only if the stored hash is still the one that was
    // presented. This one statement is both the check and the swap, so if two
    // requests present the same token, only one wins.
    const refreshToken = await this.signRefreshToken(sub, sid);
    const swapped = await this.sessionsRepository.update(
      { id: sid, userId: sub, tokenHash: presented },
      { tokenHash: hashToken(refreshToken), lastUsedAt: new Date() },
    );

    if (swapped.affected !== 1) {
      // A signed token that is not the current one for its session was used
      // before. Either the owner or a thief holds an old copy, so end the
      // session and make everybody sign in again.
      await this.sessionsRepository.delete({ id: sid, userId: sub });
      throw new UnauthorizedException(
        'Refresh token was already used. Please sign in again.',
      );
    }
    return { accessToken: await this.signAccessToken(user, sid), refreshToken };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersRepository.findOneBy({ email: dto.email });
    if (user && user.isActive) {
      await this.sendCode(user, MailTokenPurpose.RESET_PASSWORD);
    }
    return {
      message: 'If that email is registered, a reset code has been sent.',
    };
  }

  // Not the access-token secret, so a reset session can never pass as a login.
  private get resetSecret(): string {
    return `${this.config.getOrThrow<string>('JWT_SECRET')}:password-reset`;
  }

  // Changes whenever the password does, so a reset session works only once.
  private passwordVersion(passwordHash: string | null): string {
    return hashToken(passwordHash ?? '').slice(0, 16);
  }

  private findWithPassword(where: { email: string } | { id: number }) {
    const query = this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password');
    return 'email' in where
      ? query.where('user.email = :email', where).getOne()
      : query.where('user.id = :id', where).getOne();
  }

  // Step 2 of a reset: the emailed code, together with the email it was sent
  // to, is exchanged for a 10 minute reset session.
  async verifyPasswordResetOtp(dto: VerifyPasswordDto) {
    const user = await this.findWithPassword({ email: dto.email });
    if (
      !user ||
      !user.isActive ||
      !(await this.consumeCode(user.id, MailTokenPurpose.RESET_PASSWORD, dto.code))
    ) {
      throw new BadRequestException(INVALID_CODE);
    }
    const resetToken = await this.jwtService.signAsync(
      {
        sub: user.id,
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
      throw new BadRequestException("Passwords don't match");
    }
    const invalid = new UnauthorizedException(
      'Invalid or expired password reset session',
    );
    let payload: { sub?: number; type?: string; pv?: string };
    try {
      payload = await this.jwtService.verifyAsync(resetToken, {
        secret: this.resetSecret,
      });
    } catch {
      throw invalid;
    }
    if (typeof payload.sub !== 'number' || payload.type !== 'password_reset') {
      throw invalid;
    }
    const user = await this.findWithPassword({ id: payload.sub });
    if (
      !user ||
      !user.isActive ||
      payload.pv !== this.passwordVersion(user.password)
    ) {
      throw invalid;
    }
    await this.usersRepository.update(user.id, {
      password: await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS),
      // The code came from the inbox, which proves the address is theirs.
      isVerified: true,
      mustChangePassword: false,
    });
    // A new password signs the account out everywhere.
    await this.sessionsRepository.delete({ userId: user.id });
    this.realtime.disconnectUser(user.id);
    return { message: 'Password reset successfully' };
  }

  /** The devices signed in to this account. Never includes the tokens. */
  async listSessions(userId: number) {
    return this.sessionsRepository.find({
      where: { userId },
      select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
      order: { lastUsedAt: 'DESC' },
    });
  }

  /** Signs one device out. Only your own sessions can be found. */
  async revokeSession(userId: number, sessionId: string) {
    const result = await this.sessionsRepository.delete({ id: sessionId, userId });
    if (!result.affected) throw new NotFoundException('Session not found');
    this.realtime.disconnectSession(sessionId);
    return { message: 'Device signed out' };
  }

  /** "Sign out everywhere else": every device but the one asking. */
  async revokeOthers(userId: number, currentSid?: string) {
    const others = await this.sessionsRepository.find({
      where: currentSid ? { userId, id: Not(currentSid) } : { userId },
      select: { id: true },
    });
    if (others.length > 0) {
      await this.sessionsRepository.delete({ id: In(others.map((s) => s.id)) });
      others.forEach((s) => this.realtime.disconnectSession(s.id));
    }
    return { message: 'Signed out of other devices', count: others.length };
  }

  async logout(userId: number, refreshToken?: string) {
    if (refreshToken) {
      // This device only. The userId filter means a token can only ever end
      // one of the caller's own sessions.
      const parsed = await this.readRefreshToken(refreshToken).catch(() => null);
      if (parsed) {
        await this.sessionsRepository.delete({ id: parsed.sid, userId });
        this.realtime.disconnectSession(parsed.sid);
      }
    } else {
      await this.sessionsRepository.delete({ userId });
      this.realtime.disconnectUser(userId);
    }
    return { message: 'Logged out successfully' };
  }
}
