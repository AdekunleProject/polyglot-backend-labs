import { Field, InputType, ObjectType } from '@nestjs/graphql';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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
  username: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  password: string;
}

@InputType()
export class SocialLoginInput {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  providerId: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  username: string;
}

@InputType()
export class ResetPasswordConfirmInput {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsString()
  @IsNotEmpty()
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