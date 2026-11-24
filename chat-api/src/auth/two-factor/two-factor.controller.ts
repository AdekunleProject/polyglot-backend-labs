import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth.service';
import { AuthUser } from '../auth-user.type';
import { CurrentUser } from '../current-user.decorator';
import { ThrottleByEmail } from '../email-throttler.guard';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { perMinute } from '../throttle';
import {
  DisableTwoFactorDto,
  TwoFactorCodeDto,
  TwoFactorLoginDto,
} from './dto/two-factor.dto';
import { TwoFactorService } from './two-factor.service';

@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly auth: AuthService,
  ) {}

  @Post('setup')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMinute(10))
  setup(@CurrentUser() user: AuthUser) {
    return this.twoFactor.setup(user.id);
  }

  @Post('enable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMinute(10))
  enable(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactor.enable(user.id, dto.code);
  }

  @Post('disable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMinute(5))
  disable(@CurrentUser() user: AuthUser, @Body() dto: DisableTwoFactorDto) {
    return this.twoFactor.disable(user.id, dto.code, dto.password);
  }

  // Second step of sign-in, after POST /auth/login answered twoFactorRequired.
  @Post('login')
  @HttpCode(200)
  @Throttle(perMinute(5))
  @ThrottleByEmail()
  login(@Body() dto: TwoFactorLoginDto) {
    return this.auth.loginWithTwoFactor(dto);
  }
}
