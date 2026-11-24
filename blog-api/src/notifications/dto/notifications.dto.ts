import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CursorQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token: string;

  @IsIn(['ios', 'android', 'web'])
  platform: 'ios' | 'android' | 'web';
}

export class RemoveDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token: string;
}
