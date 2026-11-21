import {
  Body,
  Controller,
  Post,
  UseGuards,
  Get,
  UseInterceptors,
  UploadedFile,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { FileInterceptor } from '@nestjs/platform-express/multer/interceptors/file.interceptor';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorators';
import type { CurrentUserInterface } from 'src/common/interfaces/current-user.interface';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Role } from 'src/common/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { uploadOptions } from 'src/aws/aws.multer-uploads';
import { GoogleAuthGuard } from '../common/guards/google.auth';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { Throttle } from '@nestjs/throttler';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ThrottleByEmail } from './email-throttler.guard';
import { perMinute } from './throttle';

@Controller('auth/')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin(): void {} // to make it explicit that Passport handles the redirect.

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const { accessToken, refreshToken } = await this.authService.googleLogin(
      req.user,
    );
    const frontendUrl = this.configService.getOrThrow('FRONTEND_URL');
    res.redirect(
      `${frontendUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`,
    );
  }

  @Throttle(perMinute(5))
  @ThrottleByEmail()
  @Post('verify-email')
  async emailVerify(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyUser(dto.email, dto.code);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: CurrentUserInterface) {
    return user;
  }

  @Throttle(perMinute(3))
  @ThrottleByEmail()
  @Post('resend-verification')
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Throttle(perMinute(10))
  @Post('signup')
  @UseInterceptors(FileInterceptor('image', uploadOptions))
  signup(@Body() dto: SignupDto, @UploadedFile() image?: Express.Multer.File) {
    return this.authService.signup(dto, image);
  }

  @Throttle(perMinute(5))
  @ThrottleByEmail()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Throttle(perMinute(30))
  @Post('refresh')
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Throttle(perMinute(3))
  @ThrottleByEmail()
  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Throttle(perMinute(5))
  @ThrottleByEmail()
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.email,
      resetPasswordDto.code,
      resetPasswordDto,
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER, Role.ADMIN)
  logout(@CurrentUser() user: CurrentUserInterface, @Body() dto: LogoutDto) {
    return this.authService.logout(user.id, dto?.refreshToken);
  }
}
