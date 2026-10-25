import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// export type BrandDocument = HydratedDocument<Brand>;

@Schema({
  timestamps: true,
})
export class Brand extends Document {
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
    default: '',
    trim: true,
  })
  description!: string;

  @Prop({
    default: true,
  })
  isActive!: boolean;

  @Prop()
  logo?: string;
}

export const BrandSchema = SchemaFactory.createForClass(Brand);
