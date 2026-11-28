import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  dealDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  dealHours?: number;

  @IsOptional()
  @IsString()
  visualSignature?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsMongoId()
  category!: string;

  @IsMongoId()
  brand!: string;

  @IsNumber()
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPrice?: number;

  @IsOptional()
  @IsString()
  sku!: string;

  // BUG FIX: was required (@IsString() with no @IsOptional()), but
  // product.service.ts's create() always generates this itself via
  // slugify(dto.name, ...) and ignores whatever's sent here anyway. The
  // admin frontend never sends a slug (correctly, since it's not
  // something an admin should type in) — so this field being required
  // meant every single product-creation request failed validation with
  // "slug should not be empty", regardless of anything else being
  // correct. Made optional to match how it's actually used.
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsArray()
  images?: string[];
}
