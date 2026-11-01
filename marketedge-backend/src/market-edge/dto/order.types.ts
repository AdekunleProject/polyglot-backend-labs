import { Field, Float, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

@InputType()
export class OrderItemInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sku: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity: number;

  @Field(() => Float)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1_000_000_000)
  unitPrice: number;
}

@InputType()
export class PlaceOrderInput {
  @Field()
  @IsUUID()
  idempotencyKey: string;

  @Field(() => [OrderItemInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items: OrderItemInput[];
}

@ObjectType()
export class OrderItemType {
  @Field() sku: string;
  @Field(() => Int) quantity: number;
  @Field(() => Float) unitPrice: number;
}

@ObjectType()
export class OrderGraphType {
  @Field(() => ID) id: string;
  @Field() idempotencyKey: string;
  @Field() agentId: string;
  @Field(() => [OrderItemType]) items: OrderItemType[];
}
