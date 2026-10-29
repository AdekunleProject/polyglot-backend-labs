import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class SmsTask extends Document {
  @Prop({ required: true }) broadcastId: string;
  @Prop({ required: true }) phoneNumber: string;
  @Prop({ required: true }) message: string;
  @Prop({ required: true }) id: string;
  @Prop({ required: true, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING' }) status: string;
}
export const SmsTaskSchema = SchemaFactory.createForClass(SmsTask);
SmsTaskSchema.index({ status: 1, _id: 1 });
