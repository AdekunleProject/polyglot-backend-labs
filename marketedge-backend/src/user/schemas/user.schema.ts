// src/user/schemas/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from '../../auth/roles.enum';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, trim: true })
  username: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: false })
  passwordHash?: string;

  @Prop({ type: String, required: true, enum: Object.values(Role), default: Role.CUSTOMER })
  role: Role;

  @Prop({ required: true, default: false })
  isVerified: boolean;

  // Sparse unique indexes let many users have no social id without clashing.
  @Prop({ required: false, unique: true, sparse: true })
  googleId?: string;

  @Prop({ required: false, unique: true, sparse: true })
  appleId?: string;

  // Email verification and password reset use separate codes, so a code
  // issued for one purpose can never be used for the other.
  @Prop({ required: false })
  verifyOtpCode?: string;

  @Prop({ required: false })
  verifyOtpExpiresAt?: Date;

  @Prop({ required: true, default: 0 })
  verifyOtpAttempts: number;

  @Prop({ required: false })
  resetOtpCode?: string;

  @Prop({ required: false })
  resetOtpExpiresAt?: Date;

  @Prop({ required: true, default: 0 })
  resetOtpAttempts: number;

  // Brute-force protection for password login.
  @Prop({ required: true, default: 0 })
  failedLoginAttempts: number;

  @Prop({ required: false })
  lockedUntil?: Date;

  // Identity link: connects the user account to a Customer analytics record.
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: false })
  customerProfileLink?: Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);
