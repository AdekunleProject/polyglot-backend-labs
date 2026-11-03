import 'dotenv/config';
import { DataSource } from 'typeorm';
import { OrderItem } from './orders/entities/order-item.entity';
import { Order } from './orders/entities/order.entity';
import { Product } from './products/entities/product.entity';
import { User } from './users/entities/user.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [User, Product, Order, OrderItem],
  migrations: ['src/migrations/*.ts'],
});
