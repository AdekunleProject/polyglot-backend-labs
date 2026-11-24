import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  // Present: sign out this device only. Absent: sign out everywhere.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
