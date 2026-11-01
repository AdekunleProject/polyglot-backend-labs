import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from '../schemas/order.schema';
import { PlaceOrderInput } from '../dto/order.types';

@Injectable()
export class OrderService {
  constructor(@InjectModel(Order.name) private orderModel: Model<Order>) {}

  /**
   * Safe to retry. A mobile client on a bad network may send the same request
   * twice; the second call returns the order the first one created, because
   * idempotencyKey has a unique index.
   */
  async placeOrder(agentId: string, input: PlaceOrderInput): Promise<Order> {
    try {
      return await this.orderModel.create({
        idempotencyKey: input.idempotencyKey,
        agentId,
        items: input.items.map(({ sku, quantity, unitPrice }) => ({ sku, quantity, unitPrice })),
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const existing = await this.orderModel.findOne({ idempotencyKey: input.idempotencyKey });
        if (existing) return existing;
      }
      throw error;
    }
  }
}
