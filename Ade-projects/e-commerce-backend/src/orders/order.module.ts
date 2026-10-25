import { Module } from '@nestjs/common';
import { OrdersController } from './order.controller';
import { OrdersService } from './order.service';
import { OrderSchema, Order } from './schemas/order.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { Cart, CartSchema } from 'src/cart/schemas/cart.schemas';
// import { CartService } from 'src/cart/cart.service';
import { CartModule } from 'src/cart/cart.module';
import { VariantsModule } from 'src/Product-Variants/product-variant.module';
import { NotificationsModule } from 'src/notifications/notification.module';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Cart.name, schema: CartSchema },
    ]),
    CartModule,
    VariantsModule,
    NotificationsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
