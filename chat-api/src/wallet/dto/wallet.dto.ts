import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Whole kobo: 150000 is ₦1,500.00.
const KOBO_MAX = 1_000_000_000_000;

export class FundDto {
  @IsInt()
  @Min(1)
  @Max(KOBO_MAX)
  amount: number;
}

export class TransferDto {
  @IsInt()
  toUserId: number;

  @IsInt()
  @Min(1)
  @Max(KOBO_MAX)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  // A new random value for every payment the person makes. Sending the same one again is safe: nothing is paid twice.
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  idempotencyKey: string;
}

export class PayInChatDto {
  @IsInt()
  @Min(1)
  @Max(KOBO_MAX)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  idempotencyKey: string;
}

export class PayQrDto extends PayInChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  code: string;
}

export class ResolveQrDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  code: string;
}

export class HistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}
