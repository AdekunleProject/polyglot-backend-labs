import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorators';
import type { CurrentUserInterface } from '../common/interfaces/current-user.interface';
import { NotificationsService } from './notification.service';
import { QueryNotificationDto } from './dto/query-notification.dto';

// No @Roles()/RolesGuard here on purpose — both customers and admins get
// notifications, so this is scoped to "whoever the JWT belongs to" rather
// than one specific role, same as GET /auth/me.
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findMine(
    @CurrentUser() user: CurrentUserInterface,
    @Query() query: QueryNotificationDto,
  ) {
    return this.notificationsService.findMine(
      user.id,
      query.unreadOnly ?? false,
    );
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: CurrentUserInterface) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserInterface,
  ) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: CurrentUserInterface) {
    return this.notificationsService.markAllAsRead(user.id);
  }
}
