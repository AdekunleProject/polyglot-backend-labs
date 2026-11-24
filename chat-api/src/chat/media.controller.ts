import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user.type';
import { perMinute } from '../auth/throttle';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUploadDto } from './dto/chat.dto';
import { MediaService } from './media.service';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads')
  @HttpCode(200)
  @Throttle(perMinute(30))
  createUpload(@CurrentUser() user: AuthUser, @Body() dto: CreateUploadDto) {
    return this.media.createUpload(user.id, dto);
  }
}
