// src/auth/auth.service.ts
import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../user/schemas/user.schema';
import { EmailDispatchService } from '../market-edge/services/email-dispatch.service';
import { LocalRegisterInput, LocalLoginInput, ResetPasswordConfirmInput } from './dto/auth.inputs';
import { Role } from '../auth/roles.enum';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailDispatchService,
  ) {}

  private generateAlphanumericOtp(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async generateTokens(user: User) {
    const payload = { sub: user._id, username: user.username, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
      role: user.role,
    };
  }

  async registerLocal(input: LocalRegisterInput) {
    const existing = await this.userModel.findOne({ 
      $or: [{ username: input.username }, { email: input.email }] 
    });
    if (existing) throw new ConflictException('Username or email already registered.');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const code = this.generateAlphanumericOtp();

    const user = await this.userModel.create({
      username: input.username,
      email: input.email,
      passwordHash,
      role: Role.CUSTOMER,
      isVerified: false,
      resetOtpCode: await bcrypt.hash(code, 10),
      resetOtpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    await this.emailService.sendVerificationEmail(user.email, code);
    return this.generateTokens(user);
  }

  async verifyEmailOtp(email: string, otp: string): Promise<boolean> {
    const user = await this.userModel.findOne({ email });
    if (!user || !user.resetOtpCode || !user.resetOtpExpiresAt) {
      throw new BadRequestException('No active verification session.');
    }

    if (new Date() > user.resetOtpExpiresAt) throw new BadRequestException('Verification code expired.');

    const isValid = await bcrypt.compare(otp.toUpperCase(), user.resetOtpCode);
    if (!isValid) throw new UnauthorizedException('Invalid verification code.');

    user.isVerified = true;
    user.resetOtpCode = undefined;
    user.resetOtpExpiresAt = undefined;
    await user.save();
    return true;
  }

  async loginLocal(input: LocalLoginInput) {
    const user = await this.userModel.findOne({ username: input.username });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials.');
    if (!user.isVerified) throw new UnauthorizedException('Please verify your email via OTP first.');

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials.');

    return this.generateTokens(user);
  }

  async forgotPasswordLoop(email: string): Promise<string> {
    const user = await this.userModel.findOne({ email });
    if (!user) throw new BadRequestException('No account linked to this email.');

    const code = this.generateAlphanumericOtp();
    user.resetOtpCode = await bcrypt.hash(code, 10);
    user.resetOtpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await this.emailService.sendPasswordResetEmail(email, code);
    return 'Recovery code successfully sent.';
  }

  async verifyResetAndMutatePassword(input: ResetPasswordConfirmInput): Promise<boolean> {
    const user = await this.userModel.findOne({ email: input.email });
    if (!user || !user.resetOtpCode || !user.resetOtpExpiresAt) throw new BadRequestException('Invalid recovery session.');

    if (new Date() > user.resetOtpExpiresAt) throw new BadRequestException('Recovery code expired.');

    const isMatch = await bcrypt.compare(input.otpCode.toUpperCase(), user.resetOtpCode);
    if (!isMatch) throw new UnauthorizedException('Invalid verification code.');

    user.passwordHash = await bcrypt.hash(input.newPassword, 10);
    user.resetOtpCode = undefined;
    user.resetOtpExpiresAt = undefined;
    await user.save();
    return true;
  }

  async handleSocialStrategy(email: string, providerId: string, provider: 'google' | 'apple', username: string) {
    let user = await this.userModel.findOne({ email });

    if (!user) {
      // Corrected structural bracket mappings for dynamic property initialization
      const userData: Record<string, any> = {
        username,
        email,
        role: Role.CUSTOMER,
        isVerified: true,
      };
      userData[`${provider}Id`] = providerId;
      
      user = await this.userModel.create(userData);
    } else {
      if (!user[`${provider}Id`]) {
        user[`${provider}Id`] = providerId;
        await user.save();
      }
    }

    return this.generateTokens(user);
  }
}
