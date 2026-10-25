import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

import { User } from '../../users/schemas/user.schema';
import { ProductVariant } from 'src/Product-Variants/schemas/product-variant.schema';

// export type CartDocument = HydratedDocument<Cart>;

@Schema({ _id: false })
export class CartItem {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: ProductVariant.name,
    required: true,
  })
  variant!: Types.ObjectId;

  @Prop({
    required: true,
    min: 1,
    default: 1,
  })
  quantity!: number;
}

@Schema({
  timestamps: true,
})
export class Cart {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    unique: true,
  })
  user!: Types.ObjectId;

  @Prop({
    type: [CartItem],
    default: [],
  })
  items!: CartItem[];
}

export const CartSchema = SchemaFactory.createForClass(Cart);
