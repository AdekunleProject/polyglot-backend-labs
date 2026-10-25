import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
export class CreateProductVariantDto {
  @IsMongoId()
  product!: string;

  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsNumber()
  @Min(0)
  stock!: number;

  @Transform(({ value }) =>
    typeof value === 'string' ? JSON.parse(value) : value,
  )
  @IsObject()
  attributes!: Record<string, string>;
}
