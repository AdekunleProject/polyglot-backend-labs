import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import type { PopulatedDoc } from 'mongoose';
import { Product } from '../../products/schemas/product.schema';

@Schema({
  timestamps: true,
})
export class ProductVariant extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Product.name,
    required: true,
  })
  product!: PopulatedDoc<Product, Types.ObjectId>;

  @Prop({
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  sku!: string;

  @Prop({
    default: 0,
    min: 0,
  })
  price!: number;

  @Prop({
    required: true,
    min: 0,
    default: 0,
  })
  stock!: number;

  @Prop({
    type: Map,
    of: String,
    default: {},
  })
  attributes!: Map<string, string>;

  @Prop({
    type: [String],
    default: [],
  })
  images?: string[];

  @Prop({
    default: true,
  })
  isActive!: boolean;
}

export const ProductVariantSchema =
  SchemaFactory.createForClass(ProductVariant);
