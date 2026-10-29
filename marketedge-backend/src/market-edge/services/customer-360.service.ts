import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '../schemas/customer.schema';

@Injectable()
export class Customer360Service {
  constructor(@InjectModel(Customer.name) private customerModel: Model<Customer>) {}

  async getCustomer360Profile(customerId: string) {
    const customer = await this.customerModel.findOne({ customerId });
    if (!customer) throw new NotFoundException('Customer profile not mapped.');

    return {
      customerId: customer.customerId,
      currentVipScore: customer.currentVipScore,
      recentTransactions: customer.recentTransactions,
      financialSnapshot: {
        paystackId: 'pstk_link_' + customerId,
        email: customerId + '@marketedge-client.com',
        totalSpentLocalCurrency: customer.recentTransactions.reduce((s, t) => s + t.amount, 0),
        status: 'active',
      },
    };
  }
}
