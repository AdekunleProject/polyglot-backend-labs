import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CursorQueryDto, RegisterDeviceDto, RemoveDeviceDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(@CurrentUser() user: AuthUser, @Query() query: CursorQueryDto) {
    return this.notifications.list(user.id, query.cursor, query.limit);
  }

  @Get('notifications/unread-count')
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch('notifications/:id/read')
  read(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('devices')
  @HttpCode(200)
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.notifications.registerDevice(user.id, dto.token, dto.platform);
  }

  @Delete('devices')
  remove(@CurrentUser() user: AuthUser, @Body() dto: RemoveDeviceDto) {
    return this.notifications.removeDevice(user.id, dto.token);
  }
}
