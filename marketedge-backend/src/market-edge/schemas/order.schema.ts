import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export interface OrderItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

@Schema({ timestamps: true })
export class Order extends Document {
  // Chosen by the client (a UUID). The unique index makes a retried request
  // return the original order instead of creating a duplicate.
  @Prop({ required: true, unique: true }) idempotencyKey: string;
  @Prop({ required: true }) agentId: string;
  @Prop({ type: Array, required: true }) items: OrderItem[];
}
export const OrderSchema = SchemaFactory.createForClass(Order);
