import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** A 6 digit authenticator code, or a backup code such as ABCDE-FGHJK. */
export class TwoFactorCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;
}

export class DisableTwoFactorDto extends TwoFactorCodeDto {
  // Required for accounts that have a password.
  @IsOptional()
  @IsString()
  password?: string;
}

export class TwoFactorLoginDto extends TwoFactorCodeDto {
  // Counted by the per-email limit, and must match the challenge's owner.
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  challengeToken: string;
}
