import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export enum NotificationType {
  ORDER_PLACED = 'ORDER_PLACED',
  NEW_ORDER = 'NEW_ORDER',
  ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',
  TRANSFER_SUBMITTED = 'TRANSFER_SUBMITTED',
  TRANSFER_REJECTED = 'TRANSFER_REJECTED',
  LOW_STOCK = 'LOW_STOCK',
  USER_SIGNUP = 'USER_SIGNUP',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  ADMIN_PROFILE_CREATED = 'ADMIN_PROFILE_CREATED',
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  ACCOUNT_DEACTIVATED = 'ACCOUNT_DEACTIVATED',
}

@Schema({ timestamps: true })
export class Notification extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  recipient!: Types.ObjectId;

  @Prop({
    type: String,
    enum: NotificationType,
    required: true,
  })
  type!: NotificationType;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  message!: string;

  // Frontend route to send the user to when they click the notification —
  // e.g. /orders/<id> or /admin/payments. Optional since not every
  // notification needs to link anywhere.
  @Prop()
  link?: string;

  @Prop({ default: false, index: true })
  isRead!: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
