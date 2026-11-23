import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from 'src/audit/audit.module';
import { FileUpload } from 'src/aws/aws.file-upload';
import { NotificationsModule } from 'src/notifications/notification.module';
import { OrdersModule } from 'src/orders/order.module';
import { Order, OrderSchema } from 'src/orders/schemas/order.schema';
import { PaymentsModule } from 'src/payments/payment.module';
import { Payment, PaymentSchema } from 'src/payments/schemas/payment.schema';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import {
  RefundRequest,
  RefundRequestSchema,
} from './schemas/refund-request.schema';

@Module({
  imports: [
    ConfigModule,
    AuditModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    MongooseModule.forFeature([
      { name: RefundRequest.name, schema: RefundRequestSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
  ],
  controllers: [RefundsController],
  providers: [RefundsService, FileUpload],
})
export class RefundsModule {}
