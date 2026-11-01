import { Field, ObjectType, Float, Int } from '@nestjs/graphql';

@ObjectType()
class RecentTransactionType {
  @Field(() => Float) amount: number;
  @Field() branchId: string;
  @Field(() => Float) timestamp: number;
}

// Built from the customer's recorded transactions. The old version returned
// invented values (a made-up Paystack id and email), which misled the caller.
@ObjectType()
class FinancialSnapshot {
  @Field(() => Int) transactionCount: number;
  @Field(() => Float) totalSpentLocalCurrency: number;
  @Field(() => Float, { nullable: true }) lastTransactionAt?: number;
}

@ObjectType()
export class Customer360GraphResponse {
  @Field() customerId: string;
  @Field(() => Float) currentVipScore: number;
  @Field(() => [RecentTransactionType]) recentTransactions: RecentTransactionType[];
  @Field(() => FinancialSnapshot) financialSnapshot: FinancialSnapshot;
}
