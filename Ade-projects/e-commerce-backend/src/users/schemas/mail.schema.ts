import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export enum MailTokenPurpose {
  VERIFY_EMAIL = 'verify',
  RESET_PASSWORD = 'reset',
}

/**
 * A short code that was emailed to a user. Only a hash is stored (see
 * auth/verification-code.ts), it is tied to one purpose, and it is deleted
 * when used, so it works once. MongoDB removes expired ones by itself.
 */
@Schema({ versionKey: false, timestamps: true })
export class MailToken extends Document {
  // SHA-256 of purpose, user and code. Never the code itself.
  @Prop({ required: true })
  token!: string;

  @Prop({ required: true, type: mongoose.Types.ObjectId })
  userId!: mongoose.Types.ObjectId;

  @Prop({ required: true, type: String, enum: Object.values(MailTokenPurpose) })
  purpose!: MailTokenPurpose;

  @Prop({ required: true })
  expiryDate!: Date;
}

export const MailTokenSchema = SchemaFactory.createForClass(MailToken);
MailTokenSchema.index({ userId: 1, purpose: 1 });
// Expired codes are cleaned up by MongoDB (checked about once a minute).
MailTokenSchema.index({ expiryDate: 1 }, { expireAfterSeconds: 0 });
