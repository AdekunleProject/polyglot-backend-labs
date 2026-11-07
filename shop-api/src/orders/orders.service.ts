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
  async findMine(user: AuthUser) {
    return this.ordersRepository.find({
      where: { user: { id: user.id } },
      relations: { items: { product: true } },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, user: AuthUser) {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: { items: { product: true }, user: true },
    });
    // someone else's order gets the same 404 as a missing one
    if (!order || (user.role !== 'admin' && order.user.id !== user.id)) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  async cancel(id: number, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id },
        relations: { user: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order || (user.role !== 'admin' && order.user.id !== user.id)) {
        throw new NotFoundException(`Order ${id} not found`);
      }
      if (order.status === 'cancelled') {
        throw new BadRequestException('Order is already cancelled');
      }
      const items = await manager.find(OrderItem, {
        where: { order: { id } },
        relations: { product: true },
      });
      // restore stock in a consistent order to avoid deadlocks
      items.sort((a, b) => a.product.id - b.product.id);
      for (const item of items) {
        await manager.increment(
          Product,
          { id: item.product.id },
          'stock',
          item.quantity,
        );
      }

      order.status = 'cancelled';
      await manager.save(order);
      return { id: order.id, status: order.status };
    });
  }
}
