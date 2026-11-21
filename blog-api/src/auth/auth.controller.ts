import { Body, Controller, Get, HttpCode, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors, 
  UnauthorizedException,
} from '@nestjs/common';
import { VerifyPasswordDto } from './dto/verify-password.dto';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { uploadOptions } from '../aws/aws.multer-uploads';
import { AuthService } from './auth.service';
import { AuthUser } from './auth-user.type';
import { CurrentUser } from './current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { GoogleAuthGuard } from './google-auth.guard';
import { GoogleProfile } from './google.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ThrottleByEmail } from './email-throttler.guard';
import { perMinute } from './throttle';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle(perMinute(10))
  @UseInterceptors(FileInterceptor('image', uploadOptions))
  register(@Body() dto: RegisterDto, @UploadedFile() image?: Express.Multer.File) {
    return this.authService.register(dto, image);
  }

  @Post('verify-email')
  @HttpCode(200)
  @Throttle(perMinute(5))
  @ThrottleByEmail()
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @HttpCode(200)
  @Throttle(perMinute(3))
  @ThrottleByEmail()
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Post('login')
  @Throttle(perMinute(5))
  @ThrottleByEmail()
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(perMinute(20))
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle(perMinute(3))
  @ThrottleByEmail()
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('verify-password')
  @HttpCode(200)
  @Throttle(perMinute(5))
  async verifyPassword(
    @Body() dto: VerifyPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyPasswordResetOtp(dto);
    res.cookie('password_reset', result.resetToken, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge: 10 * 60 * 1000,
      path: '/auth',
    });
    return {
      message: result.message,
    };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle(perMinute(5))
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resetToken = req.cookies?.password_reset;
    if (!resetToken) {
      throw new UnauthorizedException(
        'Password reset session missing or expired',
      );
    }
    const result = await this.authService.resetPassword(dto, resetToken);
    res.clearCookie('password_reset', {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/auth',
    });
    return result;
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthUser, @Body() dto: LogoutDto) {
    return this.authService.logout(user.id, dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  // Passport redirects the browser to Google. The body is never reached.
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin(): void {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const tokens = await this.authService.googleLogin(req.user as GoogleProfile);
    const frontend = (this.config.get<string>('FRONTEND_URL') ?? '')
      .split(',')[0]
      .trim();
    if (!frontend) {
      // No frontend configured: hand the tokens back as JSON instead.
      return res.json(tokens);
    }
    // In the fragment (after #), not the query string: a fragment is never
    // sent to a server or written to access logs.
    const fragment = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    return res.redirect(`${frontend}/auth/callback#${fragment.toString()}`);
  }
}
