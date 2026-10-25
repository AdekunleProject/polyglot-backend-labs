import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

import { PaymentsController } from './payment.controller';
import { PaymentsService } from './payment.service';
import { PayStackService } from './paystack.service';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from 'src/users/user.module';
import { CartModule } from 'src/cart/cart.module';
import { FileUpload } from 'src/aws/aws.file-upload';
import { NotificationsModule } from 'src/notifications/notification.module';

// CLEANUP: this previously also imported/provided OrdersService,
// VariantsService, and registered the ProductVariant schema — none of
// which PaymentsController or PaymentsService actually inject anywhere.
// That created a second, entirely redundant instance of OrdersService
// scoped only to this module (separate from the real one OrdersModule
// uses), for no reason. Removed all three; nothing else in this module
// depended on them.
@Module({
  imports: [
    ConfigModule,
    HttpModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
    ]),
    UsersModule,
    CartModule,
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PayStackService, FileUpload],
  exports: [PaymentsService],
})
export class PaymentsModule {}
