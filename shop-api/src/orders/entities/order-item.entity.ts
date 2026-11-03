import {
  Check,
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { Order } from './order.entity';

@Entity('order_items')
@Check('CHK_order_items_quantity_positive', '"quantity" > 0')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  quantity: number;

  // the price at the moment of purchase; later price changes must not rewrite history
  @Column({ type: 'integer' })
  unitPriceCents: number;

  @ManyToOne(() => Order, (order) => order.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  order: Order;

  @ManyToOne(() => Product, { nullable: false, onDelete: 'RESTRICT' })
  product: Product;
}
