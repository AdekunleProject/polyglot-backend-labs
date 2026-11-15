/**
 * Integration test for the money path: stock, orders, payments, webhook.
 *
 * It starts the real app against a real MongoDB replica set (needed for
 * transactions) and fakes only Paystack, so no network or money is involved.
 *
 * Run a throwaway MongoDB, then the test:
 *   docker run -d --name it-mongo -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all
 *   docker exec it-mongo mongosh --quiet --eval \
 *     "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
 *   pnpm test:e2e
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filters';
import { PayStackService } from '../src/payments/paystack.service';
import { User } from '../src/users/schemas/user.schema';
import { Role } from '../src/common/enums/role.enum';
import { NotificationType } from '../src/notifications/schemas/notification.schema';
import { PaymentStatus as PaymentRecordStatus } from '../src/payments/schemas/payment.schema';
import { PaymentStatus as OrderPaymentStatus } from '../src/orders/schemas/order.schema';

const PASSWORD = 'Passw0rd-e2e!';
const WEBHOOK_SECRET = process.env.PAYSTACK_SECRET_KEY as string;

const address = {
  fullName: 'Test Buyer',
  line1: '1 Test Street',
  city: 'Lagos',
  state: 'Lagos',
  postalCode: '100001',
  country: 'Nigeria',
};

const paystackFake = {
  initializeTransaction: jest.fn(),
  verifyTransaction: jest.fn(),
  refundTransaction: jest.fn(),
};

describe('Checkout (integration)', () => {
  let app: INestApplication;
  let connection: Connection;
  let userModel: Model<User>;
  let adminToken: string;
  let counter = 0;

  const http = () => request(app.getHttpServer());
  const idOf = (res: request.Response): string => (res.body as { _id: string })._id;

  async function createUser(role: Role): Promise<string> {
    counter += 1;
    const email = `${role}-${counter}-${Date.now()}@e2e.test`;
    await userModel.create({
      firstname: 'E2E',
      lastname: role,
      email,
      password: await bcrypt.hash(PASSWORD, 4),
      role,
      isVerified: true,
      isActive: true,
    });
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(201);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function createVariant(stock: number, price = 1000): Promise<string> {
    counter += 1;
    const auth = { Authorization: `Bearer ${adminToken}` };
    const category = await http().post('/categories').set(auth).send({ name: `Cat ${counter}-${Date.now()}` });
    const brand = await http().post('/brands').set(auth).send({ name: `Brand ${counter}-${Date.now()}` });
    const product = await http()
      .post('/products')
      .set(auth)
      .send({
        name: `Product ${counter}-${Date.now()}`,
        description: 'integration test product',
        category: idOf(category),
        brand: idOf(brand),
        price,
        sku: `SKU-${counter}-${Date.now()}`,
      });
    expect(product.status).toBe(201);
    const variant = await http()
      .post('/variants')
      .set(auth)
      .send({
        product: idOf(product),
        sku: `VAR-${counter}-${Date.now()}`,
        stock,
        attributes: { size: 'M' },
      });
    expect(variant.status).toBe(201);
    return idOf(variant);
  }

  async function stockOf(variantId: string): Promise<number> {
    const res = await http().get(`/variants/${variantId}`);
    return (res.body as { stock: number }).stock;
  }

  function addToCart(token: string, variantId: string, quantity: number) {
    return http()
      .post('/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId, quantity });
  }

  function placeOrder(token: string) {
    return http()
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ shippingAddress: address });
  }

  async function orderWithPayment(total = 2000) {
    const token = await createUser(Role.CUSTOMER);
    const variantId = await createVariant(5, total / 2);
    expect((await addToCart(token, variantId, 2)).status).toBe(201);
    const order = await placeOrder(token);
    expect(order.status).toBe(201);
    const orderId = idOf(order);
    const init = await http()
      .post('/payments/initialize')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId });
    expect(init.status).toBe(201);
    const reference = (init.body as { reference: string }).reference;
    return { token, orderId, reference, variantId };
  }

  function signedWebhook(reference: string, event = 'charge.success', secret = WEBHOOK_SECRET) {
    const raw = JSON.stringify({ event, data: { reference } });
    const signature = createHmac('sha512', secret).update(raw).digest('hex');
    return http()
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(raw);
  }

  const paymentOf = (reference: string) =>
    connection.collection('payments').findOne({ transactionReference: reference });
  const orderDoc = (orderId: string) =>
    connection.collection('orders').findOne({ _id: new Types.ObjectId(orderId) });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PayStackService)
      .useValue(paystackFake)
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    userModel = app.get<Model<User>>(getModelToken(User.name));

    // Safety: only ever wipe a database that is clearly a test database.
    const dbName = connection.db!.databaseName;
    if (!dbName.endsWith('_it')) {
      throw new Error(`Refusing to wipe "${dbName}". Test database names must end in _it.`);
    }
    await connection.dropDatabase();
    await Promise.all(Object.values(connection.models).map((m) => m.init()));

    adminToken = await createUser(Role.ADMIN);
  });

  beforeEach(() => {
    paystackFake.initializeTransaction.mockReset().mockResolvedValue({
      data: { authorization_url: 'https://paystack.test/pay', access_code: 'AC_test' },
    });
    paystackFake.verifyTransaction.mockReset();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('access control', () => {
    it('rejects an anonymous order and a customer creating catalogue data', async () => {
      expect((await http().post('/orders').send({ shippingAddress: address })).status).toBe(401);
      const customer = await createUser(Role.CUSTOMER);
      const res = await http()
        .post('/categories')
        .set('Authorization', `Bearer ${customer}`)
        .send({ name: 'Nope' });
      expect(res.status).toBe(403);
    });
  });

  describe('tokens', () => {
    it('signs the refresh token for the lifetime set in JWT_REFRESH_EXPIRES_IN', async () => {
      counter += 1;
      const email = `ttl-${counter}-${Date.now()}@e2e.test`;
      await userModel.create({
        firstname: 'E2E',
        lastname: 'ttl',
        email,
        password: await bcrypt.hash(PASSWORD, 4),
        role: Role.CUSTOMER,
        isVerified: true,
        isActive: true,
      });
      const res = await http().post('/auth/login').send({ email, password: PASSWORD });
      const { refreshToken } = res.body as { refreshToken: string };
      const payload = JSON.parse(
        Buffer.from(refreshToken.split('.')[1], 'base64url').toString(),
      ) as { iat: number; exp: number };
      expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
    });
  });

  describe('stock', () => {
    it('reserves stock and totals the order from database prices', async () => {
      const token = await createUser(Role.CUSTOMER);
      const variantId = await createVariant(5, 1500);
      expect((await addToCart(token, variantId, 2)).status).toBe(201);

      const order = await placeOrder(token);
      expect(order.status).toBe(201);
      expect((order.body as { total: number }).total).toBe(3000);
      expect(await stockOf(variantId)).toBe(3);
    });

    it('refuses to oversell: two buyers, one unit, exactly one order succeeds', async () => {
      const rounds = 10;
      for (let i = 0; i < rounds; i += 1) {
        const variantId = await createVariant(1);
        const [a, b] = await Promise.all([createUser(Role.CUSTOMER), createUser(Role.CUSTOMER)]);
        expect((await addToCart(a, variantId, 1)).status).toBe(201);
        expect((await addToCart(b, variantId, 1)).status).toBe(201);

        const results = await Promise.all([placeOrder(a), placeOrder(b)]);
        const statuses = results.map((r) => r.status).sort();

        expect(statuses).toEqual([201, 400]);
        expect(await stockOf(variantId)).toBe(0);
      }
    });
  });

  describe('payment initialisation', () => {
    it('sends the amount to Paystack in kobo and blocks a second payment', async () => {
      const { token, orderId } = await orderWithPayment(2000);

      expect(paystackFake.initializeTransaction).toHaveBeenCalledTimes(1);
      const sent = paystackFake.initializeTransaction.mock.calls[0][0] as { amount: number };
      expect(sent.amount).toBe(200000);

      const again = await http()
        .post('/payments/initialize')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId });
      expect(again.status).toBe(400);
    });
  });

  describe('Paystack webhook', () => {
    it('rejects a bad signature and changes nothing', async () => {
      const { reference } = await orderWithPayment();

      const res = await signedWebhook(reference, 'charge.success', 'not-the-real-secret');

      expect(res.status).toBe(400);
      expect(paystackFake.verifyTransaction).not.toHaveBeenCalled();
      expect((await paymentOf(reference))?.status).toBe(PaymentRecordStatus.PENDING);
    });

    it('marks payment and order paid after confirming with Paystack, and ignores a replay', async () => {
      const { reference, orderId } = await orderWithPayment(2000);
      paystackFake.verifyTransaction.mockResolvedValue({
        data: {
          status: 'success',
          amount: 200000,
          currency: 'NGN',
          id: 987654,
          channel: 'card',
          paid_at: new Date().toISOString(),
        },
      });

      const first = await signedWebhook(reference);
      expect(first.status).toBe(200);
      expect((await paymentOf(reference))?.status).toBe(PaymentRecordStatus.PAID);
      expect((await orderDoc(orderId))?.paymentStatus).toBe(OrderPaymentStatus.PAID);

      const replay = await signedWebhook(reference);
      expect(replay.status).toBe(200);
      expect(paystackFake.verifyTransaction).toHaveBeenCalledTimes(1);
    });

    it('does not mark an order paid when the amount paid is wrong', async () => {
      const { reference, orderId } = await orderWithPayment(2000);
      paystackFake.verifyTransaction.mockResolvedValue({
        data: { status: 'success', amount: 100, currency: 'NGN', id: 1, channel: 'card', paid_at: new Date().toISOString() },
      });

      await signedWebhook(reference);

      expect((await paymentOf(reference))?.status).toBe(PaymentRecordStatus.FAILED);
      expect((await orderDoc(orderId))?.paymentStatus).not.toBe(OrderPaymentStatus.PAID);
    });

    it('pays the order once when two webhooks arrive at the same moment', async () => {
      const { reference, orderId } = await orderWithPayment(2000);
      paystackFake.verifyTransaction.mockResolvedValue({
        data: {
          status: 'success',
          amount: 200000,
          currency: 'NGN',
          id: 555,
          channel: 'card',
          paid_at: new Date().toISOString(),
        },
      });

      const [a, b] = await Promise.all([signedWebhook(reference), signedWebhook(reference)]);

      expect([a.status, b.status]).toEqual([200, 200]);
      expect((await paymentOf(reference))?.status).toBe(PaymentRecordStatus.PAID);
      expect((await orderDoc(orderId))?.paymentStatus).toBe(OrderPaymentStatus.PAID);
      const payment = await paymentOf(reference);
      const received = await connection
        .collection('notifications')
        .countDocuments({ recipient: payment?.user, type: NotificationType.PAYMENT_RECEIVED });
      expect(received).toBe(1);
    });

    it('ignores events other than charge.success', async () => {
      const { reference } = await orderWithPayment();

      const res = await signedWebhook(reference, 'transfer.success');

      expect(res.status).toBe(200);
      expect(paystackFake.verifyTransaction).not.toHaveBeenCalled();
      expect((await paymentOf(reference))?.status).toBe(PaymentRecordStatus.PENDING);
    });
  });
});
