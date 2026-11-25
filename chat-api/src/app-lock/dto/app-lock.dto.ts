import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';

export const AUTO_LOCK_SECONDS = [0, 30, 60, 300, 900, 3600] as const;

export class SetAppLockDto {
  /** The app's own password: 6 to 32 characters, and not your account password. */
  @IsString()
  @Length(6, 32)
  passcode: string;

  @IsOptional()
  @IsBoolean()
  biometric?: boolean;

  /** Lock again after this many seconds in the background. 0 = every time. */
  @IsOptional()
  @IsIn(AUTO_LOCK_SECONDS)
  autoLockSeconds?: number;
}

export class PasscodeDto {
  @IsString()
  @Length(1, 32)
  passcode: string;
}

export class UpdateAppLockDto {
  @IsString()
  @Length(1, 32)
  passcode: string;

  @IsOptional()
  @IsBoolean()
  biometric?: boolean;

  @IsOptional()
  @IsIn(AUTO_LOCK_SECONDS)
  autoLockSeconds?: number;

  /** A new passcode, if you want to change it. */
  @IsOptional()
  @IsString()
  @Length(6, 32)
  newPasscode?: string;
}
