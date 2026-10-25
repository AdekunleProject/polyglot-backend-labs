import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Cart, CartSchema } from './schemas/cart.schemas';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

import { VariantsModule } from '../Product-Variants/product-variant.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Cart.name,
        schema: CartSchema,
      },
    ]),
    VariantsModule,
  ],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
