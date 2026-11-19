import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { StrongPassword } from '../strong-password.decorator';

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;

  @StrongPassword()
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}
