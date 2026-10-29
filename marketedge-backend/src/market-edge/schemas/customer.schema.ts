import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export interface TransactionSnapshot { amount: number; branchId: string; timestamp: number; }

@Schema()
export class Customer extends Document {
  @Prop({ required: true, unique: true }) customerId: string;
  @Prop({ required: true, default: 0 }) currentVipScore: number;
  @Prop({ type: Array, default: [] }) recentTransactions: TransactionSnapshot[];
}
export const CustomerSchema = SchemaFactory.createForClass(Customer);
