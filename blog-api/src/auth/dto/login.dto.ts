import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  // A phone app sends a label for the device so the user can see and revoke it.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;
}
