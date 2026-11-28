import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Product } from '../../products/schemas/product.schema';
import { User } from '../../users/schemas/user.schema';

@Schema({ _id: true, timestamps: { createdAt: true, updatedAt: false } })
export class ReviewReply {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  user!: Types.ObjectId;

  @Prop({ required: true })
  authorName!: string;

  @Prop({ required: true })
  authorRole!: string;

  @Prop({ required: true, trim: true, maxlength: 1000 })
  text!: string;

  createdAt!: Date;
}
export const ReviewReplySchema = SchemaFactory.createForClass(ReviewReply);

@Schema({ timestamps: true })
export class Review extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name, required: true, index: true })
  product!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true, index: true })
  user!: Types.ObjectId;

  @Prop({ required: true })
  authorName!: string;

  @Prop({ required: true })
  authorRole!: string;

  @Prop({ required: true, min: 1, max: 5 })
  rating!: number;

  @Prop({ trim: true, maxlength: 1000, default: '' })
  comment!: string;

  @Prop({ default: false })
  edited!: boolean;

  @Prop({ type: [ReviewReplySchema], default: [] })
  replies!: ReviewReply[];
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ product: 1, user: 1 }, { unique: true });
