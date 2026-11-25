import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { perMinute } from '../auth/throttle';
import { AppLockService } from './app-lock.service';
import { PasscodeDto, SetAppLockDto, UpdateAppLockDto } from './dto/app-lock.dto';

@Controller('app-lock')
@UseGuards(JwtAuthGuard)
export class AppLockController {
  constructor(private readonly lock: AppLockService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.lock.status(user);
  }

  @Post()
  @HttpCode(200)
  @Throttle(perMinute(10))
  enable(@CurrentUser() user: AuthUser, @Body() dto: SetAppLockDto) {
    return this.lock.enable(user, dto);
  }

  @Patch()
  @Throttle(perMinute(20))
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateAppLockDto) {
    return this.lock.update(user, dto);
  }

  @Delete()
  @Throttle(perMinute(20))
  disable(@CurrentUser() user: AuthUser, @Body() dto: PasscodeDto) {
    return this.lock.disable(user, dto.passcode);
  }

  @Post('lock')
  @HttpCode(200)
  lockNow(@CurrentUser() user: AuthUser) {
    return this.lock.lock(user);
  }

  @Post('unlock')
  @HttpCode(200)
  @Throttle(perMinute(30))
  unlock(@CurrentUser() user: AuthUser, @Body() dto: PasscodeDto) {
    return this.lock.unlock(user, dto.passcode);
  }

  @Post('unlock/biometric')
  @HttpCode(200)
  @Throttle(perMinute(30))
  unlockWithBiometric(@CurrentUser() user: AuthUser) {
    return this.lock.unlockWithBiometric(user);
  }
}
