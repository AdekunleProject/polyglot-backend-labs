// src/user/schemas/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from '../../auth/roles.enum';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, index: true }) 
  username: string;

  @Prop({ required: true, unique: true, index: true }) 
  email: string;

  @Prop({ required: false }) 
  passwordHash?: string;

  @Prop({ required: true, enum: Role, default: Role.CUSTOMER }) 
  role: Role;

  @Prop({ required: true, default: false }) 
  isVerified: boolean;

  // Sparse index maps allow entries to be blank without triggering duplicate index errors
  @Prop({ required: false, unique: true, sparse: true }) 
  googleId?: string;

  @Prop({ required: false, unique: true, sparse: true }) 
  appleId?: string;

  @Prop({ required: false }) 
  resetOtpCode?: string;

  @Prop({ required: false }) 
  resetOtpExpiresAt?: Date;

  // Identity Link: Connects the user account to a Customer analytics metrics target
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: false })
  customerProfileLink?: Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);
