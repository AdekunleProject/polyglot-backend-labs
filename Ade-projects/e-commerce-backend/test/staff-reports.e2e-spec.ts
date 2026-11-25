/**
 * Integration test for the audit trail, staff activity report, sales report
 * and weekly digest. Same setup as the checkout test (real MongoDB replica set).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filters';
import { User } from '../src/users/schemas/user.schema';
import { Role } from '../src/common/enums/role.enum';

const PASSWORD = 'Passw0rd-e2e!';
const address = {
  fullName: 'Test Buyer',
  line1: '1 Test Street',
  city: 'Lagos',
  state: 'Lagos',
  postalCode: '100001',
  country: 'Nigeria',
};

interface Person {
  id: string;
  token: string;
}

describe('Audit trail, staff reports and digest (integration)', () => {
  let app: INestApplication;
  let connection: Connection;
  let userModel: Model<User>;
  let counter = 0;
  let manager: Person;
  let admin: Person;
  let superadmin: Person;
  let customer: Person;

  const http = () => request(app.getHttpServer());
  const auth = (p: Person) => ({ Authorization: `Bearer ${p.token}` });
  const idOf = (res: request.Response): string => (res.body as { _id: string })._id;

  async function person(role: Role): Promise<Person> {
    counter += 1;
    const email = `${role}-${counter}-${Date.now()}@e2e.test`;
    const user = await userModel.create({
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
    return { id: String(user._id), token: (res.body as { accessToken: string }).accessToken };
  }

  const entries = async (action: string) => {
    const res = await http().get(`/audit-logs?action=${action}&limit=100`).set(auth(superadmin));
    expect(res.status).toBe(200);
    return (res.body as { items: { actorId: string; action: string; targetId: string | null; details: Record<string, any> | null }[] }).items;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    const dbName = connection.db!.databaseName;
    if (!dbName.endsWith('_it')) throw new Error(`Refusing to wipe "${dbName}".`);
    await Promise.all(Object.values(connection.models).map((m) => m.deleteMany({})));
    await Promise.all(Object.values(connection.models).map((m) => m.init()));

    manager = await person(Role.MANAGER);
    admin = await person(Role.ADMIN);
    superadmin = await person(Role.SUPERADMIN);
    customer = await person(Role.CUSTOMER);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('the audit trail records shop-floor changes', () => {
    let productId: string;
    let variantId: string;
    let orderId: string;

    it('records a product, a variant, a stock change and a deletion', async () => {
      const category = await http().post('/categories').set(auth(manager)).send({ name: `Cat ${Date.now()}` });
      const brand = await http().post('/brands').set(auth(manager)).send({ name: `Brand ${Date.now()}` });
      const product = await http().post('/products').set(auth(manager)).send({
        name: `Audited ${Date.now()}`,
        description: 'audit test product',
        category: idOf(category),
        brand: idOf(brand),
        price: 1000,
        sku: `AUD-${Date.now()}`,
      });
      expect(product.status).toBe(201);
      productId = idOf(product);
      expect((await entries('product.create')).some((e) => e.targetId === productId && e.actorId === manager.id)).toBe(true);

      const update = await http().put(`/products/${productId}`).set(auth(manager)).send({ price: 1500 });
      expect(update.status).toBe(200);
      const updated = (await entries('product.update')).find((e) => e.targetId === productId);
      expect(updated?.details?.changes.price).toEqual({ from: 1000, to: 1500 });

      const variant = await http().post('/variants').set(auth(manager)).send({
        product: productId,
        sku: `AUDV-${Date.now()}`,
        stock: 5,
        attributes: { size: 'M' },
      });
      expect(variant.status).toBe(201);
      variantId = idOf(variant);
      expect((await entries('variant.create')).some((e) => e.targetId === variantId)).toBe(true);

      const stock = await http().patch(`/variants/${variantId}/stock`).set(auth(manager)).send({ stock: 9 });
      expect(stock.status).toBe(200);
      const stockEntry = (await entries('variant.stock_update')).find((e) => e.targetId === variantId);
      expect(stockEntry?.details).toEqual({ from: 5, to: 9 });

      expect((await http().delete(`/variants/${variantId}`).set(auth(manager))).status).toBe(200);
      expect((await entries('variant.delete')).some((e) => e.targetId === variantId)).toBe(true);
      expect((await http().delete(`/products/${productId}`).set(auth(manager))).status).toBe(200);
      expect((await entries('product.delete')).some((e) => e.targetId === productId)).toBe(true);
    });

    it('records an order status change with the old and new status', async () => {
      const category = await http().post('/categories').set(auth(manager)).send({ name: `Cat2 ${Date.now()}` });
      const brand = await http().post('/brands').set(auth(manager)).send({ name: `Brand2 ${Date.now()}` });
      const product = await http().post('/products').set(auth(manager)).send({
        name: `Ordered ${Date.now()}`,
        description: 'order audit product',
        category: idOf(category),
        brand: idOf(brand),
        price: 1000,
        sku: `ORD-${Date.now()}`,
      });
      const variant = await http().post('/variants').set(auth(manager)).send({
        product: idOf(product),
        sku: `ORDV-${Date.now()}`,
        stock: 5,
        attributes: { size: 'L' },
      });
      expect((await http().post('/cart/items').set(auth(customer)).send({ variantId: idOf(variant), quantity: 1 })).status).toBe(201);
      const order = await http().post('/orders').set(auth(customer)).send({ shippingAddress: address });
      expect(order.status).toBe(201);
      orderId = idOf(order);

      const change = await http().put(`/orders/${orderId}`).set(auth(manager)).send({ status: 'processing' });
      expect(change.status).toBe(200);
      const entry = (await entries('order.update')).find((e) => e.targetId === orderId);
      expect(entry?.details?.status).toEqual({ from: 'pending', to: 'processing' });
    });
  });

  describe('staff activity', () => {
    it('shows each role only the people at or below them, and exports CSV', async () => {
      const ids = async (p: Person) =>
        ((await http().get('/analytics/staff-activity').set(auth(p))).body as { staff: { id: string }[] }).staff.map((s) => s.id);

      expect(await ids(manager)).toEqual([manager.id]);
      const forAdmin = await ids(admin);
      expect(forAdmin).toContain(admin.id);
      expect(forAdmin).toContain(manager.id);
      expect(forAdmin).not.toContain(superadmin.id);
      const forSuper = await ids(superadmin);
      expect(forSuper).toEqual(expect.arrayContaining([superadmin.id, admin.id, manager.id]));
      expect(forSuper).not.toContain(customer.id);

      expect((await http().get('/analytics/staff-activity').set(auth(customer))).status).toBe(403);
      const csv = await http().get('/analytics/staff-activity?format=csv').set(auth(superadmin));
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text.split('\n')[0]).toContain('twoFactorEnabled');
    });

    it("counts what the manager did and flags a missing second factor", async () => {
      const report = await http().get('/analytics/staff-activity').set(auth(admin));
      const row = (report.body as { staff: { id: string; totalActions: number; actions: Record<string, number>; flags: string[] }[] }).staff.find(
        (s) => s.id === manager.id,
      );
      expect(row?.totalActions).toBeGreaterThanOrEqual(5);
      expect(row?.actions['product.create']).toBeGreaterThanOrEqual(1);
      expect(row?.flags.some((f) => f.includes('two-factor'))).toBe(true);
    });
  });

  describe('sales report and weekly digest', () => {
    it('gives admins a sales report, not managers, and refuses a bad period', async () => {
      expect((await http().get('/analytics/sales').set(auth(manager))).status).toBe(403);
      const res = await http().get('/analytics/sales').set(auth(admin));
      expect(res.status).toBe(200);
      expect((res.body as { totals: { orders: number } }).totals.orders).toBeGreaterThanOrEqual(1);
      expect((await http().get('/analytics/sales?format=csv').set(auth(admin))).text).toContain('day,orders,payments,revenue');
      expect((await http().get('/analytics/sales?from=2026-05-01&to=2026-01-01').set(auth(admin))).status).toBe(400);
      expect((await http().get('/analytics/sales?from=2020-01-01&to=2026-01-01').set(auth(admin))).status).toBe(400);
    });

    it('lets only the superadmin send the digest, and records it', async () => {
      expect((await http().post('/analytics/digest/send').set(auth(admin))).status).toBe(403);
      const res = await http().post('/analytics/digest/send').set(auth(superadmin));
      expect(res.status).toBe(201);
      expect((res.body as { recipients: number }).recipients).toBeGreaterThanOrEqual(1);
      expect((await entries('digest.sent')).length).toBeGreaterThanOrEqual(1);
    });
  });
});
