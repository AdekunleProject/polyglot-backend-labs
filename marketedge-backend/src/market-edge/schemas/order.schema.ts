import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Order extends Document {
  @Prop({ required: true, unique: true }) idempotencyKey: string; 
  @Prop({ required: true }) agentId: string;
  @Prop({ type: Array, required: true }) items: any[];
}
export const OrderSchema = SchemaFactory.createForClass(Order);
