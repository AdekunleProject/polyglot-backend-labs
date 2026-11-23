import { IsEnum, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRefundRequestDto {
  @IsMongoId()
  readonly orderId!: string;

  /** DEFECT: damaged, faulty or not what was ordered. CANCELLATION: no longer wanted, not delivered yet. */
  @IsEnum(['DEFECT', 'CANCELLATION'])
  readonly type!: 'DEFECT' | 'CANCELLATION';

  /** Required for DEFECT. A cancellation always asks for the refund. */
  @IsOptional()
  @IsEnum(['REFUND', 'REPLACEMENT'])
  readonly resolution?: 'REFUND' | 'REPLACEMENT';

  @IsString()
  @MinLength(20, { message: 'Please describe the problem in at least 20 characters' })
  @MaxLength(1000)
  readonly reason!: string;
}
