import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let productId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE order_items, orders, products, users RESTART IDENTITY CASCADE',
    );
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Buyer',
        email: 'buyer@example.com',
        password: 'password123',
      });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'buyer@example.com', password: 'password123' });
    token = login.body.accessToken;
    const rows = await dataSource.query(
      `INSERT INTO products (name, "priceCents", stock) VALUES ('Sneakers', 5000, 1) RETURNING id`,
    );
    productId = rows[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  const buy = (quantity = 1) =>
    request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId, quantity }] });

  it('sells the last item to exactly one of 10 simultaneous buyers', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => buy()));
    const codes = results.map((r) => r.status);

    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 400)).toHaveLength(9);

    const [{ stock }] = await dataSource.query('SELECT stock FROM products');
    expect(stock).toBe(0);
    const [{ count }] = await dataSource.query('SELECT count(*) FROM orders');
    expect(Number(count)).toBe(1);
  });

  it('leaves no orphan order when stock is insufficient', async () => {
    await buy(5).expect(400);
    const [{ count }] = await dataSource.query('SELECT count(*) FROM orders');
    expect(Number(count)).toBe(0);
  });

  it('restores stock on cancel and refuses a second cancel', async () => {
    const order = await buy().expect(201);
    await request(app.getHttpServer())
      .patch(`/orders/${order.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const [{ stock }] = await dataSource.query('SELECT stock FROM products');
    expect(stock).toBe(1);
    await request(app.getHttpServer())
      .patch(`/orders/${order.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it("hides another user's order with 404", async () => {
    const order = await buy().expect(201);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Other',
        email: 'other@example.com',
        password: 'password123',
      });
    const other = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'other@example.com', password: 'password123' });
    await request(app.getHttpServer())
      .get(`/orders/${order.body.id}`)
      .set('Authorization', `Bearer ${other.body.accessToken}`)
      .expect(404);
  });
});
