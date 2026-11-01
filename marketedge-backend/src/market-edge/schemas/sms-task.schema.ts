import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// The old schema declared a required `id` field that nothing ever filled in,
// so every broadcast failed validation. MongoDB's own _id identifies a task.
@Schema({ timestamps: true })
export class SmsTask extends Document {
  @Prop({ required: true, index: true }) broadcastId: string;
  @Prop({ required: true }) phoneNumber: string;
  @Prop({ required: true }) message: string;
  @Prop({ required: true, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING' }) status: string;
  @Prop({ required: false }) providerMessageId?: string;
  @Prop({ required: false }) error?: string;
}
export const SmsTaskSchema = SchemaFactory.createForClass(SmsTask);
SmsTaskSchema.index({ status: 1, _id: 1 });
