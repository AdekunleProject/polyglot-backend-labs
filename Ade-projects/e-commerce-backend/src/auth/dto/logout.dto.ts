import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  // Send the refresh token of this device to sign out of this device only.
  // Leave it out to sign out of every device.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
