import { IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class PhoneDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phoneNumber: string;
}

export class PhoneCodeDto extends PhoneDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'The code is 6 digits' })
  code: string;
}

export class PhoneLoginDto extends PhoneCodeDto {
  // So the person can see and sign out this device later.
  @IsOptional()
  @IsString()
  @Length(1, 100)
  deviceName?: string;
}
