import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ScanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  code: string;
}

export class QrEnabledDto {
  @IsBoolean()
  enabled: boolean;
}
