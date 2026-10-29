import { Field, InputType, ID, ObjectType } from '@nestjs/graphql';
import { Role } from '../../auth/roles.enum';

@InputType()
export class CreateAdminUserInput {
  @Field() username: string;
  @Field() email: string;
  @Field() password: string;
  @Field(() => Role) role: Role;
  
}

@InputType()
export class UpdateAdminUserInput {
  @Field(() => ID) id: string;
  @Field({ nullable: true }) username?: string;
  @Field({ nullable: true }) role?: string;
}

@ObjectType()
export class UserGraphType {
  @Field(() => ID) id: string;
  @Field() username: string;
  @Field() email: string;
  @Field() role: string;
  @Field() isVerified: boolean;
  @Field({ nullable: true }) customerProfileLink?: string;
}
