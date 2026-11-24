import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { perMinute } from '../auth/throttle';
import { ContactsService } from './contacts.service';
import { QrEnabledDto, ScanDto } from './dto/contacts.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get('qr')
  myCode(@CurrentUser() user: AuthUser) {
    return this.contacts.myCode(user.id);
  }

  @Post('qr/reset')
  @HttpCode(200)
  reset(@CurrentUser() user: AuthUser) {
    return this.contacts.resetCode(user.id);
  }

  @Patch('qr')
  enable(@CurrentUser() user: AuthUser, @Body() dto: QrEnabledDto) {
    return this.contacts.setEnabled(user.id, dto.enabled);
  }

  @Post('scan')
  @HttpCode(200)
  @Throttle(perMinute(30))
  scan(@CurrentUser() user: AuthUser, @Body() dto: ScanDto) {
    return this.contacts.scan(user.id, dto.code);
  }
}
