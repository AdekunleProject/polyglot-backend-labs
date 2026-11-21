import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(/(?=.*[!@#$%^&*])(?=.*[0-9])(?=.*[A-Z])(?=.*[a-z])/, {
    message:
      'Password must be alpha-numeric, must have upper and lower case and at least one special character.',
  })
  readonly newPassword!: string;

  @IsString()
  @IsNotEmpty()
  readonly confirmPassword!: string;
}
