import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum RefundStatus {
  SUBMITTED = 'SUBMITTED',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  DECLINED = 'DECLINED',
  REFUNDED = 'REFUNDED',
  REPLACEMENT_APPROVED = 'REPLACEMENT_APPROVED',
  REPLACEMENT_SENT = 'REPLACEMENT_SENT',
}

@Schema({ timestamps: true, versionKey: false })
export class RefundRequest extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  order!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Payment', required: true })
  payment!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user!: Types.ObjectId;

  @Prop({ type: String, enum: ['DEFECT', 'CANCELLATION'], required: true })
  type!: 'DEFECT' | 'CANCELLATION';

  @Prop({ type: String, enum: ['REFUND', 'REPLACEMENT'], required: true })
  resolution!: 'REFUND' | 'REPLACEMENT';

  @Prop({ required: true })
  reason!: string;

  /** Storage keys of the photos or videos the customer sent. */
  @Prop({ type: [String], default: [] })
  evidence!: string[];

  @Prop({ type: Date, default: null })
  deliveredAt!: Date | null;

  /** In the smallest unit (kobo). What the admin pays out if they approve. */
  @Prop({ required: true })
  amountMinor!: number;

  @Prop({
    type: String,
    enum: RefundStatus,
    default: RefundStatus.SUBMITTED,
    index: true,
  })
  status!: RefundStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  verifiedBy!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  verifiedAt!: Date | null;

  @Prop({ type: String, default: null })
  verificationNote!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  decidedBy!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  @Prop({ type: String, default: null })
  decisionNote!: string | null;
}

export const RefundRequestSchema = SchemaFactory.createForClass(RefundRequest);
