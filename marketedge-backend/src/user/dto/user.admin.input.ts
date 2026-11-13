import { Field, InputType, ID, ObjectType } from '@nestjs/graphql';
import {
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { Role } from '../../auth/roles.enum';

// The global ValidationPipe uses `whitelist: true`, which silently removes any
// field that has no class-validator decorator. Every field below therefore
// carries one; without them these inputs arrive empty.
@InputType()
export class CreateAdminUserInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/\S/, { message: 'Username cannot contain only whitespace.' })
  username: string;

  @Field()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Field()
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;

  @Field(() => Role, { nullable: true })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

@InputType()
export class UpdateAdminUserInput {
  @Field(() => ID)
  @IsMongoId()
  id: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/\S/, { message: 'Username cannot contain only whitespace.' })
  username?: string;

  @Field(() => Role, { nullable: true })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

@ObjectType()
export class UserGraphType {
  @Field(() => ID)
  id: string;

  @Field()
  username: string;

  @Field()
  email: string;

  @Field(() => Role)
  role: Role;

  @Field()
  isVerified: boolean;

  @Field({ nullable: true })
  customerProfileLink?: string;
}

@ObjectType()
export class CustomerProfileType {
  @Field(() => ID)
  id: string;

  @Field()
  username: string;

  @Field()
  email: string;

  @Field(() => Role)
  role: Role;

  @Field()
  isVerified: boolean;
}

@InputType()
export class UpdateCustomerProfileInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/\S/, { message: 'Username cannot contain only whitespace.' })
  username?: string;
}
