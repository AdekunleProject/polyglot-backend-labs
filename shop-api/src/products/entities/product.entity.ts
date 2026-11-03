import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('products')
@Check('CHK_products_stock_non_negative', '"stock" >= 0')
@Check('CHK_products_price_non_negative', '"priceCents" >= 0')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 200 })
  name: string;

  // money is stored as whole cents (kobo), never as a float
  @Column({ type: 'integer' })
  priceCents: number;

  @Column({ type: 'integer', default: 0 })
  stock: number;

  @CreateDateColumn()
  createdAt: Date;
}
