// src/market-edge/services/vip-intelligence.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '../schemas/customer.schema';
import Redis from 'ioredis';

@Injectable()
export class VipIntelligenceService {
  private redisClient: Redis;

  constructor(@InjectModel(Customer.name) private customerModel: Model<Customer>) {
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: 6379,
      password: process.env.REDIS_PASSWORD,
    });
  }

  async getCachedVipScore(customerId: string): Promise<number> {
    const cached = await this.redisClient.get(`vip:score:${customerId}`);
    if (cached) return parseFloat(cached);

    const customer = await this.customerModel.findOne({ customerId });
    const score = customer ? customer.currentVipScore : 0;
    await this.redisClient.setex(`vip:score:${customerId}`, 3600, score);
    return score;
  }

  async processTransactionAndCache(customerId: string, amount: number, branchId: string) {
    // Atomically push, sort, and cap history entirely inside the MongoDB database engine
    const updatedCustomer = await this.customerModel.findOneAndUpdate(
      { customerId },
      {
        $push: {
          recentTransactions: {
            $each: [{ amount, branchId, timestamp: Date.now() }],
            $sort: { timestamp: -1 },
            $slice: 50, 
          },
        },
      },
      { new: true, upsert: true }
    );

    const score = updatedCustomer.recentTransactions.reduce((sum, tx) => sum + tx.amount, 0) * updatedCustomer.recentTransactions.length;
    
    // Persist calculated value and update cache concurrently
    await this.customerModel.updateOne({ customerId }, { $set: { currentVipScore: score } });
    await this.redisClient.setex(`vip:score:${customerId}`, 3600, score);

    return { customerId, calculatedVipScore: score };
  }
}
