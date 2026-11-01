import { Field, InputType, ObjectType, Float, Int } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Every field carries a class-validator decorator: the global ValidationPipe
// strips undecorated fields, which used to leave these inputs empty.
@InputType()
export class SingleSmsInput {
  @Field()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'phone must be 7 to 15 digits, optionally starting with +' })
  phone: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(480)
  msg: string;
}

export const MAX_BROADCAST_SIZE = 20_000;

@InputType()
export class BroadcastSmsInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  broadcastId: string;

  @Field(() => [SingleSmsInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BROADCAST_SIZE)
  @ValidateNested({ each: true })
  @Type(() => SingleSmsInput)
  payload: SingleSmsInput[];
}

@ObjectType()
export class GenericMutationResponse {
  @Field() success: boolean;
  @Field(() => Int, { nullable: true }) count?: number;
}

@ObjectType()
export class VipScoreResponse {
  @Field() customerId: string;
  @Field(() => Float) calculatedVipScore: number;
}
