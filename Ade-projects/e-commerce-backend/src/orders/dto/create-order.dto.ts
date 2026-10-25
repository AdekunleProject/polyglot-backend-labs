import {
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// BUG FIX: matches the ShippingAddress subdocument now used in
// order.schema.ts, and the frontend's actual ShippingAddress type —
// field names line up exactly with what the frontend sends. Previously
// `shippingAddress` here was `@IsString()`, but the frontend has always
// sent this whole object; every checkout request was rejected by
// validation. The old top-level receiverName/phoneNumber/city/state/
// postalCode fields on this DTO had no decorators at all and were never
// read anywhere in order.service.ts — removed as dead weight, their
// real equivalents now live inside ShippingAddressDto below.
export class ShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  line1!: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsString()
  @IsNotEmpty()
  postalCode!: string;

  @IsString()
  @IsNotEmpty()
  country!: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  @IsNotEmpty()
  shippingAddress!: ShippingAddressDto;
}
