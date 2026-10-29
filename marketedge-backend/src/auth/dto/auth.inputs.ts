import { Field, InputType, ObjectType } from '@nestjs/graphql';

@InputType()
export class LocalRegisterInput {
  @Field() username: string;
  @Field() email: string;
  @Field() password: string;
}

@InputType()
export class LocalLoginInput {
  @Field() username: string;
  @Field() password: string;
}

@InputType()
export class SocialLoginInput {
  @Field() email: string;
  @Field() providerId: string;
  @Field() username: string;
}

@InputType()
export class ResetPasswordConfirmInput {
  @Field() email: string;
  @Field() otpCode: string;
  @Field() newPassword: string;
}

@ObjectType()
export class AuthTokenResponse {
  @Field() accessToken: string;
  @Field() refreshToken: string;
  @Field() role: string;
}
