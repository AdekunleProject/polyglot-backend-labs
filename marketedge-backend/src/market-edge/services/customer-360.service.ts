import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '../schemas/customer.schema';

@Injectable()
export class Customer360Service {
  constructor(@InjectModel(Customer.name) private customerModel: Model<Customer>) {}

  async getCustomer360Profile(customerId: string) {
    const customer = await this.customerModel.findOne({ customerId });
    if (!customer) throw new NotFoundException('Customer profile not found.');

    const transactions = customer.recentTransactions ?? [];
    return {
      customerId: customer.customerId,
      currentVipScore: customer.currentVipScore,
      recentTransactions: transactions,
      financialSnapshot: {
        transactionCount: transactions.length,
        totalSpentLocalCurrency: transactions.reduce((sum, t) => sum + t.amount, 0),
        lastTransactionAt: transactions.length > 0 ? Math.max(...transactions.map((t) => t.timestamp)) : undefined,
      },
    };
  }
}
