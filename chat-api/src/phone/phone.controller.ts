import { Body, Controller, Delete, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { perMinute } from '../auth/throttle';
import { PhoneCodeDto, PhoneDto, PhoneLoginDto } from './dto/phone.dto';
import { PhoneService } from './phone.service';

@Controller()
export class PhoneController {
  constructor(private readonly phone: PhoneService) {}

  // Sign in with a phone number: ask for a code, then type it back.
  @Post('auth/phone/request')
  @HttpCode(200)
  @Throttle(perMinute(5))
  request(@Body() dto: PhoneDto) {
    return this.phone.requestLogin(dto.phoneNumber);
  }

  @Post('auth/phone/verify')
  @HttpCode(200)
  @Throttle(perMinute(10))
  verify(@Body() dto: PhoneLoginDto) {
    return this.phone.verifyLogin(dto.phoneNumber, dto.code, dto.deviceName);
  }

  // Put a verified phone number on your account.
  @Post('phone/add')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMinute(5))
  add(@CurrentUser() user: AuthUser, @Body() dto: PhoneDto) {
    return this.phone.addPhone(user.id, dto.phoneNumber);
  }

  @Post('phone/confirm')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMinute(10))
  confirm(@CurrentUser() user: AuthUser, @Body() dto: PhoneCodeDto) {
    return this.phone.confirmPhone(user.id, dto.phoneNumber, dto.code);
  }

  @Delete('phone')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: AuthUser) {
    return this.phone.removePhone(user.id);
  }
}
