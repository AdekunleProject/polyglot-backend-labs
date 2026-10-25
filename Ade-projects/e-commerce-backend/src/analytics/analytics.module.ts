import { AnalyticsService } from './analytics.service';
import { Module } from '@nestjs/common';
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
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Brand.name, schema: BrandSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
  ],
  controllers: [AnalyticsController],

  providers: [AnalyticsService],

  exports: [
    AnalyticsService,
    // MongooseModule,
  ],
})
export class AnalyticsModule {}
