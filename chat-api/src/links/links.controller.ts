import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { perMinute } from '../auth/throttle';
import { LinkSecretDto, StartLinkDto } from './dto/links.dto';
import { LinksService } from './links.service';

@Controller('auth/link')
export class LinksController {
  constructor(private readonly links: LinksService) {}

  // The laptop (not signed in).
  @Post('start')
  @HttpCode(200)
  @Throttle(perMinute(10))
  start(@Body() dto: StartLinkDto) {
    return this.links.start(dto.deviceName);
  }

  @Post('poll')
  @HttpCode(200)
  @Throttle(perMinute(60))
  poll(@Body() dto: LinkSecretDto) {
    return this.links.poll(dto.linkId, dto.secret);
  }

  // The phone (signed in).
  @Post('inspect')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMinute(30))
  inspect(@Body() dto: LinkSecretDto) {
    return this.links.inspect(dto.linkId, dto.secret);
  }

  @Post('approve')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMinute(20))
  approve(@CurrentUser() user: AuthUser, @Body() dto: LinkSecretDto) {
    return this.links.approve(user.id, dto.linkId, dto.secret);
  }

  @Post('deny')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(perMinute(20))
  deny(@Body() dto: LinkSecretDto) {
    return this.links.deny(dto.linkId, dto.secret);
  }
}
