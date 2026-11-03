import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type';
import { Product } from '../products/entities/product.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly itemsRepository: Repository<OrderItem>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  // NAIVE VERSION: check stock, then decrease it. Two separate steps. This is the bug.
  async createNaive(dto: CreateOrderDto, user: AuthUser) {
    const order = await this.ordersRepository.save(
      this.ordersRepository.create({
        user: { id: user.id },
        status: 'paid',
        totalCents: 0,
      }),
    );

    let total = 0;
    for (const line of dto.items) {
      const product = await this.productsRepository.findOneBy({
        id: line.productId,
      });
      if (!product)
        throw new NotFoundException(`Product ${line.productId} not found`);

      if (product.stock < line.quantity) {
        throw new BadRequestException(`Not enough stock for ${product.name}`);
      }

      // pretend payment processing takes a moment (this widens the race window)
      await new Promise((r) => setTimeout(r, 100));

      product.stock = product.stock - line.quantity;
      await this.productsRepository.save(product);

      await this.itemsRepository.save(
        this.itemsRepository.create({
          order: { id: order.id },
          product: { id: product.id },
          quantity: line.quantity,
          unitPriceCents: product.priceCents,
        }),
      );
      total += product.priceCents * line.quantity;
    }

    order.totalCents = total;
    return this.ordersRepository.save(order);
  }

  async create(dto: CreateOrderDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.save(
        manager.create(Order, {
          user: { id: user.id },
          status: 'paid',
          totalCents: 0,
        }),
      );

      // lock products in a consistent order so two orders can't deadlock each other
      const lines = [...dto.items].sort((a, b) => a.productId - b.productId);

      let total = 0;
      for (const line of lines) {
        const product = await manager.findOne(Product, {
          where: { id: line.productId },
          lock: { mode: 'pessimistic_write' }, // SELECT ... FOR UPDATE
        });
        if (!product)
          throw new NotFoundException(`Product ${line.productId} not found`);
        if (product.stock < line.quantity) {
          throw new BadRequestException(`Not enough stock for ${product.name}`);
        }
        await new Promise((r) => setTimeout(r, 100)); // same delay, so the test is fair
        product.stock -= line.quantity;
        await manager.save(product);
        await manager.save(
          manager.create(OrderItem, {
            order: { id: order.id },
            product: { id: product.id },
            quantity: line.quantity,
            unitPriceCents: product.priceCents,
          }),
        );
        total += product.priceCents * line.quantity;
      }
      order.totalCents = total;
      return manager.save(order);
    });
  }
}
