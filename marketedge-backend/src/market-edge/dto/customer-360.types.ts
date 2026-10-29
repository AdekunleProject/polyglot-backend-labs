import { Field, ObjectType, Float } from '@nestjs/graphql';

@ObjectType()
class RecentTransactionType { @Field(() => Float) amount: number; @Field() branchId: string; @Field(() => Float) timestamp: number; }

@ObjectType()
class PaystackFinancialSnapshot { @Field({ nullable: true }) paystackId: string; @Field({ nullable: true }) email: string; @Field(() => Float) totalSpentLocalCurrency: number; @Field() status: string; }

@ObjectType()
export class Customer360GraphResponse { @Field() customerId: string; @Field(() => Float) currentVipScore: number; @Field(() => [RecentTransactionType]) recentTransactions: RecentTransactionType[]; @Field(() => PaystackFinancialSnapshot) financialSnapshot: PaystackFinancialSnapshot; }
