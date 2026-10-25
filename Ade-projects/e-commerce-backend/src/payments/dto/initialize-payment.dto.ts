import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializePaymentDto {
  @ApiProperty()
  @IsMongoId()
  orderId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  callbackUrl?: string;
}
