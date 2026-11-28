import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types, Document } from 'mongoose';

import { Brand } from '../../brands/schemas/brand.schema';
import { Category } from '../../categories/schemas/category.schema';

@Schema({
  timestamps: true,
})
export class Product extends Document {
  @Prop({
    required: true,
    trim: true,
  })
  name!: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  slug!: string;

  @Prop({
    required: true,
    trim: true,
  })
  description!: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Category.name,
    required: true,
  })
  category!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Brand.name,
    required: true,
  })
  brand!: Types.ObjectId;
  @Prop({
    required: true,
  })
  price!: number;

  @Prop({
    default: 0,
    min: 0,
  })
  discountPrice!: number;

  @Prop({
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  sku!: string;

  @Prop({
    type: [String],
    default: [],
  })
  images?: string[];

  @Prop({
    default: true,
  })
  isActive!: boolean;

  @Prop({
    default: false,
  })
  featured!: boolean;

  @Prop({ default: 0, min: 0, max: 5 })
  ratingAverage!: number;

  @Prop({ default: 0, min: 0 })
  ratingCount!: number;

  // Reviews rated 4 or 5 stars. More than 65% of ratings positive earns the "Excellent" label.
  @Prop({ default: 0, min: 0 })
  ratingPositive!: number;

  // When the manager's countdown ends. Null or past means no active countdown.
  @Prop({ type: Date, default: null })
  dealEndsAt?: Date | null;

  // Coarse colour layout of the first photo, used by visual search.
  @Prop({ type: [Number], default: undefined, select: false })
  visualSignature?: number[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);
