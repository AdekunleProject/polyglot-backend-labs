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
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../helpers/mail/mail-service';
import { MailToken } from '../users/schemas/mail.schema';
import { Role } from 'src/common/enums/role.enum';
import { FileUpload } from 'src/aws/aws.file-upload';
import { AuthProvider } from 'src/common/enums/auth-provider.enum';
import { ProfileImageProvider } from '../common/enums/profile-image-provider.enum';
import { RefreshTokenDto } from './dto/refresh-token.dto';
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
          Role,
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
        expiresIn: '15m',
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user._id.toString(),
      },
      {
        secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      },
    );
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
          expiresIn: '15m',
        },
      );
      const refreshToken = await this.jwtService.signAsync(
        {
          sub: user._id.toString(),
        },
        {
          secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
          expiresIn: '30d',
        },
      );
      user.hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
      await user.save();

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
    const payload = await this.jwtService.verifyAsync(dto.refreshToken, {
      secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
    });
    const user = await this.userModel.findById(payload.sub);
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException();
    }
    const valid = await bcrypt.compare(
      dto.refreshToken,
      user.hashedRefreshToken,
    );
    if (!valid) {
      throw new UnauthorizedException();
    }
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user._id,
        email: user.email,
        role: user.role,
      },
      {
        secret: this.configService.getOrThrow('JWT_SECRET'),
        expiresIn: '15m',
      },
    );

    return {
      accessToken,
    };
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

  async logout(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      hashedRefreshToken: null,
    });

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
