import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Category extends Document {
  @Prop({
    required: true,
    unique: true,
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
    trim: true,
    default: '',
  })
  description!: string;

  @Prop({
    default: true,
  })
  isActive!: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
