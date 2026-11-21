import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { CurrentUserInterface } from '../../common/interfaces/current-user.interface';
import { AuthService } from '../auth.service';
import { ThrottleByEmail } from '../email-throttler.guard';
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
  setup(@CurrentUser() user: CurrentUserInterface) {
    return this.twoFactor.setup(user.id);
  }

  @Post('enable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMinute(10))
  enable(
    @CurrentUser() user: CurrentUserInterface,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.twoFactor.enable(user.id, dto.code);
  }

  @Post('disable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMinute(5))
  disable(
    @CurrentUser() user: CurrentUserInterface,
    @Body() dto: DisableTwoFactorDto,
  ) {
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
