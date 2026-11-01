// src/market-edge/services/vip-intelligence.service.ts
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Redis from 'ioredis';
import { PubSubEngine } from 'graphql-subscriptions';
import { Customer } from '../schemas/customer.schema';
import { PUB_SUB, REDIS_CLIENT } from '../../redis/redis.constants';

export const VIP_SCORE_UPDATED = 'vipScoreUpdated';
const CACHE_SECONDS = 3600;
const HISTORY_LIMIT = 50;
const MAX_AMOUNT = 1_000_000_000;

export function assertValidTransaction(customerId: unknown, amount: unknown): void {
  if (typeof customerId !== 'string' || customerId.trim() === '' || customerId.length > 100) {
    throw new BadRequestException('customerId must be a non-empty string of at most 100 characters.');
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new BadRequestException('amount must be a positive number.');
  }
}

@Injectable()
export class VipIntelligenceService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(PUB_SUB) private readonly pubSub: PubSubEngine,
  ) {}

  async getCachedVipScore(customerId: string): Promise<number> {
    const key = `vip:score:${customerId}`;
    const cached = await this.redis.get(key);
    if (cached !== null) return parseFloat(cached);

    const customer = await this.customerModel.findOne({ customerId });
    const score = customer ? customer.currentVipScore : 0;
    await this.redis.setex(key, CACHE_SECONDS, String(score));
    return score;
  }

  async processTransactionAndCache(customerId: string, amount: number, branchId: string) {
    assertValidTransaction(customerId, amount);

    // Push, sort and cap the history inside MongoDB in one atomic update.
    const customer = await this.customerModel.findOneAndUpdate(
      { customerId },
      {
        $push: {
          recentTransactions: {
            $each: [{ amount, branchId, timestamp: Date.now() }],
            $sort: { timestamp: -1 },
            $slice: HISTORY_LIMIT,
          },
        },
      },
      { returnDocument: 'after', upsert: true },
    );

    const history = customer.recentTransactions;
    const score = history.reduce((sum, tx) => sum + tx.amount, 0) * history.length;

    await this.customerModel.updateOne({ customerId }, { $set: { currentVipScore: score } });
    await this.redis.setex(`vip:score:${customerId}`, CACHE_SECONDS, String(score));

    const result = { customerId, calculatedVipScore: score };
    // Published here so both paths (the GraphQL mutation and the Paystack
    // webhook) notify subscribers.
    await this.pubSub.publish(VIP_SCORE_UPDATED, { [VIP_SCORE_UPDATED]: result });
    return result;
  }
}
