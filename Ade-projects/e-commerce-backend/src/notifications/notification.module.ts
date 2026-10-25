import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsController } from './notification.controller';
import { NotificationsService } from './notification.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  // Exported so OrdersModule and PaymentsModule can inject
  // NotificationsService to fire notifications from order/payment events.
  exports: [NotificationsService],
})
export class NotificationsModule {}
