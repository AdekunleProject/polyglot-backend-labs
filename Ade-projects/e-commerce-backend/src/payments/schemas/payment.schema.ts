import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PaymentStatus {
  PENDING = 'PENDING',
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentProvider {
  PAYSTACK = 'PAYSTACK',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Payment extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  })
  order!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  user!: Types.ObjectId;

  @Prop({
    required: true,
    min: 0,
  })
  amount!: number;

  @Prop({
    required: true,
    default: 'USD',
    uppercase: true,
  })
  currency!: string;

  @Prop()
  bankName?: string;

  @Prop()
  accountName?: string;

  @Prop()
  accountNumber?: string;

  @Prop()
  receiptUrl?: string;

  @Prop()
  confirmedBy?: Types.ObjectId;

  @Prop()
  confirmedAt?: Date;

  @Prop({
    type: String,
    enum: PaymentProvider,
    required: true,
  })
  provider!: PaymentProvider;

  @Prop({
    type: String,
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
    index: true,
  })
  status!: PaymentStatus;

  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
  })
  transactionReference!: string;

  @Prop()
  gatewayTransactionId?: string;

  @Prop()
  paymentMethod?: string;

  @Prop({
    type: Date,
  })
  paidAt?: Date;

  @Prop({
    type: Object,
    default: null,
  })
  gatewayResponse?: Record<string, any>;

  @Prop()
  refundReason?: string;

  @Prop({
    type: Date,
  })
  refundedAt?: Date;

  @Prop()
  receipt?: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
// PaymentSchema.index({ user: 1, createdAt: -1 });
// PaymentSchema.index({ order: 1 });
// PaymentSchema.index({ transactionReference: 1 }, { unique: true });
// PaymentSchema.index({ status: 1 });
