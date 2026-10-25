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
}

export const ProductSchema = SchemaFactory.createForClass(Product);
