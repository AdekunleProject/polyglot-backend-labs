import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

import { User } from '../../users/schemas/user.schema';

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Schema({ _id: false })
export class OrderItem {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
  })
  productId!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
  })
  variantId!: Types.ObjectId;

  @Prop({
    required: true,
  })
  productName!: string;

  @Prop({
    required: true,
  })
  variantSku!: string;

  @Prop({
    type: Map,
    of: String,
    default: {},
  })
  attributes!: Map<string, string>;

  @Prop({
    type: [String],
    default: [],
  })
  images!: string[];

  @Prop({
    required: true,
  })
  quantity!: number;

  @Prop({
    required: true,
  })
  unitPrice!: number;

  @Prop({
    required: true,
  })
  totalPrice!: number;
}

// BUG FIX: shippingAddress was previously a plain `string`, but the
// frontend has always sent (and displays, on the order confirmation and
// admin order views) a structured address object — fullName, line1,
// line2, city, state, postalCode, country, phoneNumber. Every checkout
// request was failing backend validation because of this mismatch (a
// plain object where a string was required). Field names below match the
// frontend's ShippingAddress type exactly, so no frontend changes are
// needed to align with this fix.
@Schema({ _id: false })
export class ShippingAddress {
  @Prop({ required: true })
  fullName!: string;

  @Prop({ required: true })
  line1!: string;

  @Prop()
  line2?: string;

  @Prop({ required: true })
  city!: string;

  @Prop({ required: true })
  state!: string;

  @Prop({ required: true })
  postalCode!: string;

  @Prop({ required: true })
  country!: string;

  @Prop()
  phoneNumber?: string;
}

@Schema({
  timestamps: true,
})
export class Order extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  user!: Types.ObjectId;

  @Prop({
    type: [OrderItem],
    required: true,
  })
  items!: OrderItem[];

  @Prop({ required: true })
  subtotal!: number;

  @Prop({ default: 0 })
  discount!: number;

  @Prop({ default: 0 })
  tax!: number;

  @Prop({ default: 0 })
  shipping!: number;

  @Prop({ required: true })
  total!: number;

  @Prop({
    type: String,
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  paymentStatus!: PaymentStatus;

  @Prop({
    type: String,
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @Prop({ type: ShippingAddress, required: true })
  shippingAddress!: ShippingAddress;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
