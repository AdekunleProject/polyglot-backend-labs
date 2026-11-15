import {
  BadRequestException,
  Injectable,
  NotFoundException,
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
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { MailService } from '../helpers/mail/mail-service';
import { MailToken } from '../users/schemas/mail.schema';
import { Role } from 'src/common/enums/role.enum';
import { FileUpload } from 'src/aws/aws.file-upload';
import { AuthProvider } from 'src/common/enums/auth-provider.enum';
import { ProfileImageProvider } from '../common/enums/profile-image-provider.enum';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { hashToken, sameHash } from './token-hash';
import { NotificationsService } from 'src/notifications/notification.service';
import { NotificationType } from 'src/notifications/schemas/notification.schema';

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
  ) {}

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

  // 6-character alphanumeric code, uppercase, avoiding visually ambiguous
  // characters (0/O, 1/I/L) since it's meant to be typed by hand from an
  // email rather than clicked as a link. crypto.randomInt is used (not
  // Math.random) since this guards account access.
  private generateVerificationCode(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[crypto.randomInt(chars.length)];
    }
    return code;
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
      const hashedPassword = await bcrypt.hash(signupDto.password, 12);
      const user = new this.userModel({
        firstname: signupDto.firstname,
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
      const expiryDate = new Date();
      expiryDate.setMinutes(expiryDate.getMinutes() + 15);
      const code = this.generateVerificationCode();
      await new this.mailTokenModel({
        userId: savedUser._id,
        token: code,
        expiryDate,
      }).save();
      await this.mailService.sendEmail(
        savedUser.email,
        'Verify your email',
        `Your verification code is ${code}. It expires in 15 minutes.`,
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

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.accessTokenTtl,
      },
    );
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
    try {
      const user = await this.userModel.findOne({ email });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // BUG FIX: the original query had `userId` commented out, so a code
      // wasn't actually scoped to the user it was issued to. Harmless with
      // a 64-char hex token (collision was practically impossible) but a
      // real problem with a 6-char code — restored the userId scoping.
      const verification = await this.mailTokenModel.findOneAndDelete({
        userId: user._id,
        token: code.toUpperCase(),
        expiryDate: { $gt: new Date() },
      });

      if (!verification) {
        throw new BadRequestException('Invalid or expired verification code');
      }
      user.isVerified = true;
      await user.save();
      console.log('Email verified successfully');
      return {
        message: 'Email verified successfully',
      };
    } catch (error) {
      console.log(error, 'Error occurred when verifing email');
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    try {
      const { email, password } = loginDto;
      const user = await this.userModel.findOne({ email }).select('+password');
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Wrong password');
      }
      if (user.provider === AuthProvider.GOOGLE && !user.password) {
        throw new UnauthorizedException('Please continue with Google Sign-In.');
      }
      if (!user.isVerified) {
        throw new UnauthorizedException(
          'Please verify your email before logging in.',
        );
      }
      const accessToken = await this.jwtService.signAsync(
        {
          sub: user._id.toString(),
          email: user.email,
          role: user.role,
        },
        {
          secret: this.configService.getOrThrow('JWT_SECRET'),
          expiresIn: this.accessTokenTtl,
        },
      );
      const refreshToken = await this.startSession(user._id.toString());

      await this.notificationsService.notifyUser(
        user._id,
        NotificationType.USER_LOGIN,
        'New sign-in',
        `You signed in to your account on ${new Date().toLocaleString()}.`,
      );

      const profileImage = await this.resolveProfileImage(user);
      console.log('User logged in successfully');
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
    } catch (error) {
      console.log(error, 'Error occurred during login');
      throw error;
    }
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

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
      },
      {
        secret: this.configService.getOrThrow('JWT_SECRET'),
        expiresIn: this.accessTokenTtl,
      },
    );

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
    if (!user) {
      // Same answer as for a real account, so this endpoint cannot be used
      // to find out which emails are registered.
      return {
        message: 'If that email is registered, a reset code has been sent.',
      };
    }
    // Standardized to 15 minutes — was 2m30s, unusually short for a code
    // someone has to read from their inbox and type in by hand.
    const expiryDate = new Date();
    expiryDate.setMinutes(expiryDate.getMinutes() + 15);
    const code = this.generateVerificationCode();
    await this.mailTokenModel.deleteMany({
      userId: user._id,
    });

    await new this.mailTokenModel({
      userId: user._id,
      token: code,
      expiryDate,
    }).save();
    await this.mailService.sendEmail(
      user.email,
      'Reset your password',
      `Your password reset code is ${code}. It expires in 15 minutes.`,
    );
    return {
      message: 'If that email is registered, a reset code has been sent.',
    };
  }

  async resetPassword(
    email: string,
    code: string,
    resetPasswordDto: ResetPasswordDto,
  ) {
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new NotFoundException("users doesn't exist");
    }

    // BUG FIX: this queried `{ Token: token, ... }` — capital T, but the
    // schema field is `token` (lowercase). That mismatch meant this query
    // could never match a real document, so reset-password threw "invalid
    // token" on every single attempt, no matter how correct the code was.
    // Also now scoped to this user's own token, same fix as verifyUser().
    const verification = await this.mailTokenModel.findOneAndDelete({
      userId: user._id,
      token: code.toUpperCase(),
      expiryDate: { $gte: new Date() },
    });
    if (!verification) {
      throw new NotFoundException('Invalid or expired code');
    }
    const { newPassword, confirmPassword } = resetPasswordDto;
    if (newPassword !== confirmPassword) {
      throw new NotFoundException("Password doesn't match");
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    // A new password signs the account out everywhere.
    await this.userModel.updateOne({ _id: user._id }, { $set: { sessions: [] } });
    // await this.mailTokenModel.deleteOne({
    //   _id: verification._id,
    // });
    console.log('password reset successfully');
    return {
      message: 'Password reset successfully',
    };
  }

  async validateResetToken(token: string) {
    const resetToken = await this.mailTokenModel.findOne({
      token,
      expiryDate: {
        $gt: new Date(),
      },
    });

    if (!resetToken) {
      throw new BadRequestException('Token is invalid or expired');
    }
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
