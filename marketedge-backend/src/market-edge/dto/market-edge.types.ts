import { Field, InputType, ObjectType, Float, Int } from '@nestjs/graphql';

@InputType()
class SingleSmsInput { @Field() phone: string; @Field() msg: string; }

@InputType()
export class BroadcastSmsInput { @Field() broadcastId: string; @Field(() => [SingleSmsInput]) payload: SingleSmsInput[]; }

@ObjectType()
export class GenericMutationResponse { @Field() success: boolean; @Field(() => Int, { nullable: true }) count?: number; }

@ObjectType()
export class VipScoreResponse { @Field() customerId: string; @Field(() => Float) calculatedVipScore: number; }
