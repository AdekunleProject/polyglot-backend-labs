import { IsNotEmpty, IsString } from 'class-validator';
import { StrongPassword } from '../strong-password.decorator';

// The email and code were checked in the step before (POST /auth/verify-password),
// which left a short-lived cookie. This step needs only the new password.
export class ResetPasswordDto {
  @StrongPassword()
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}
