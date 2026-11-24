import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
