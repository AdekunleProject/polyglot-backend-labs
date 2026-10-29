import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { PubSub } from 'graphql-subscriptions';
import { MarketEdgeResolver } from './market-edge.resolver';
import { SmsBroadcastService } from './services/sms-broadcast.service';
import { VipIntelligenceService } from './services/vip-intelligence.service';
import { Customer360Service } from './services/customer-360.service';
import { EmailDispatchService } from './services/email-dispatch.service';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import { Order, OrderSchema } from './schemas/order.schema';
import { SmsTask, SmsTaskSchema } from './schemas/sms-task.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Order.name, schema: OrderSchema },
      { name: SmsTask.name, schema: SmsTaskSchema },
    ]),
    BullModule.registerQueue({ name: 'sms-broadcast-queue' }),
  ],
  providers: [
    MarketEdgeResolver,
    SmsBroadcastService,
    VipIntelligenceService,
    Customer360Service,
    EmailDispatchService,
    { provide: 'PUB_SUB', useValue: new PubSub() },
  ],
  exports: [EmailDispatchService, MongooseModule],
})
export class MarketEdgeModule {}
