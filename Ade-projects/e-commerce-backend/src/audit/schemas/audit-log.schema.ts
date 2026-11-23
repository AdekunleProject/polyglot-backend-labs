import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * One document per sensitive action: who did it, to what, and when. Ids are
 * kept as plain values, not live references, so the history survives if an
 * account or product is ever removed for good.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog extends Document {
  @Prop({ type: Types.ObjectId, default: null, index: true })
  actorId!: Types.ObjectId | null;

  @Prop({ type: String, required: true, index: true })
  action!: string;

  // What the action was about: 'user', 'product', 'order', ...
  @Prop({ type: String, default: null })
  targetType!: string | null;

  @Prop({ type: String, default: null })
  targetId!: string | null;

  // Anything worth keeping: the reason, old and new values. Never a password,
  // a code or a token.
  @Prop({ type: Object, default: null })
  details!: Record<string, unknown> | null;

  createdAt!: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
