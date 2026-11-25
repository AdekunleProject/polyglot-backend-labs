import { AnalyticsService } from './analytics.service';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { User, UserSchema } from '../users/schemas/user.schema';

import { Product, ProductSchema } from '../products/schemas/product.schema';
import {
  ProductVariant,
  ProductVariantSchema,
} from '../Product-Variants/schemas/product-variant.schema';
import {
  Category,
  CategorySchema,
} from '../categories/schemas/category.schema';
import { Brand, BrandSchema } from '../brands/schemas/brand.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { AuditModule } from '../audit/audit.module';
import {
  RefundRequest,
  RefundRequestSchema,
} from '../refunds/schemas/refund-request.schema';
import { AnalyticsController } from './analytics.controller';
import { DigestService } from './digest.service';
import { MailModule } from '../helpers/mail/mail.module';

@Module({
  imports: [
    AuditModule,
    ConfigModule,
    MailModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Brand.name, schema: BrandSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: RefundRequest.name, schema: RefundRequestSchema },
    ]),
  ],
  controllers: [AnalyticsController],

  providers: [AnalyticsService, DigestService],

  exports: [
    AnalyticsService,
    // MongooseModule,
  ],
})
export class AnalyticsModule {}
