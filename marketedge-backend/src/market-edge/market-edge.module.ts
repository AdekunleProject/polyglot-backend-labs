import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { MarketEdgeResolver } from './market-edge.resolver';
import { SMS_QUEUE, SmsBroadcastService } from './services/sms-broadcast.service';
import { VipIntelligenceService } from './services/vip-intelligence.service';
import { Customer360Service } from './services/customer-360.service';
import { EmailDispatchService } from './services/email-dispatch.service';
import { OrderService } from './services/order.service';
import { SmsProcessor } from './sms/sms.processor';
import { LogSmsProvider, SMS_PROVIDER } from './sms/sms-provider';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import { Order, OrderSchema } from './schemas/order.schema';
import { SmsTask, SmsTaskSchema } from './schemas/sms-task.schema';
import { EMAIL_QUEUE } from './email/email-queue.service';
import { EmailProcessor } from './email/email.processor';
import { EmailQueueService } from './email/email-queue.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    UserModule,
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Order.name, schema: OrderSchema },
      { name: SmsTask.name, schema: SmsTaskSchema },
    ]),
    BullModule.registerQueue({ name: SMS_QUEUE }, { name: EMAIL_QUEUE }),
  ],
  providers: [
    MarketEdgeResolver,
    SmsBroadcastService,
    SmsProcessor,
    { provide: SMS_PROVIDER, useClass: LogSmsProvider },
    EmailProcessor,
  { provide: SMS_PROVIDER, useClass: LogSmsProvider },
    VipIntelligenceService,
    Customer360Service,
    EmailDispatchService,
    EmailQueueService,
    OrderService,
  ],
  exports: [EmailDispatchService,EmailQueueService, MongooseModule, VipIntelligenceService],
})
export class MarketEdgeModule {}
