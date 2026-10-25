import { IsString, IsNotEmpty } from 'class-validator';

// CRITICAL BUG FIX: this had no validation decorators at all. With the
// global ValidationPipe's whitelist:true + forbidNonWhitelisted:true,
// an undecorated property isn't recognized as a real DTO field —
// meaning every POST /auth/refresh request was rejected outright
// ("property refreshToken should not exist") before it ever reached the
// controller. Every access token expiring after 15 minutes meant an
// immediate, unrecoverable logout, since the refresh call that's
// supposed to silently renew it could never succeed.
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
