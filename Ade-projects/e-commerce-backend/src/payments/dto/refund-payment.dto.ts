import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsNumber, IsOptional, Min } from 'class-validator';

export class RefundPaymentDto {
  @IsMongoId()
  paymentId!: string;

  @ApiPropertyOptional({
    description: 'Amount in kobo for partial refund',
  })
  @IsNumber()
  @IsNumber()
  @Min(1)
  amount!: number;
}
