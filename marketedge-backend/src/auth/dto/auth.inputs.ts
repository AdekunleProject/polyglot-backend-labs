import { Field, InputType, ObjectType } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class LocalRegisterInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username: string;

  @Field()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

@InputType()
export class LocalLoginInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

/**
 * Social sign-in takes the ID token the provider (Google or Apple) gave the
 * app. The server checks it with the provider. It never trusts an email or
 * provider id sent by the client.
 */
@InputType()
export class SocialLoginInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  idToken: string;
}

@InputType()
export class ResetPasswordConfirmInput {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  otpCode: string;

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

@ObjectType()
export class AuthTokenResponse {
  @Field()
  accessToken: string;

  @Field()
  refreshToken: string;

  @Field()
  role: string;
}
