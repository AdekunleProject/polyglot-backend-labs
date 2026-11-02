import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Notes API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // the same setup as main.ts, otherwise validation would not run in tests
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    // start every test from an empty database
    await dataSource.query(
      'TRUNCATE TABLE notes, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  const register = (name: string, email: string) =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'password123' });

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' });
    return res.body.accessToken as string;
  };

  describe('auth', () => {
    it('registers a user without returning the password', async () => {
      const res = await register('Ada', 'ada@example.com').expect(201);
      expect(res.body.email).toBe('ada@example.com');
      expect(res.body.password).toBeUndefined();
    });

    it('stores a hash, not the password', async () => {
      await register('Ada', 'ada@example.com');
      const rows = await dataSource.query('SELECT password FROM users');
      expect(rows[0].password).not.toBe('password123');
      expect(rows[0].password.startsWith('$2b$')).toBe(true);
    });

    it('rejects a duplicate email with 409', async () => {
      await register('Ada', 'ada@example.com');
      await register('Ada', 'ada@example.com').expect(409);
    });

    it('rejects a short password with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Ada', email: 'ada@example.com', password: 'short' })
        .expect(400);
    });

    it('rejects a wrong password with 401', async () => {
      await register('Ada', 'ada@example.com');
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ada@example.com', password: 'wrongpass1' })
        .expect(401);
    });

    it('returns a token on correct login', async () => {
      await register('Ada', 'ada@example.com');
      const token = await login('ada@example.com');
      expect(token).toBeTruthy();
    });
  });

  describe('notes', () => {
    it('rejects requests without a token with 401', async () => {
      await request(app.getHttpServer()).get('/notes').expect(401);
    });

    it('creates a note owned by the logged-in user', async () => {
      await register('Ada', 'ada@example.com');
      const token = await login('ada@example.com');

      const res = await request(app.getHttpServer())
        .post('/notes')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'First', content: 'Hello' })
        .expect(201);

      expect(res.body.title).toBe('First');
      expect(res.body.user.id).toBeDefined();
    });

    it('rejects an empty title with 400', async () => {
      await register('Ada', 'ada@example.com');
      const token = await login('ada@example.com');

      await request(app.getHttpServer())
        .post('/notes')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '', content: 'Hello' })
        .expect(400);
    });

    it("hides another user's note with 404", async () => {
      await register('Ada', 'ada@example.com');
      await register('Tunde', 'tunde@example.com');
      const ada = await login('ada@example.com');
      const tunde = await login('tunde@example.com');

      const created = await request(app.getHttpServer())
        .post('/notes')
        .set('Authorization', `Bearer ${ada}`)
        .send({ title: 'Private', content: 'secret' })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/notes/${created.body.id}`)
        .set('Authorization', `Bearer ${tunde}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/notes/${created.body.id}`)
        .set('Authorization', `Bearer ${ada}`)
        .expect(200);
    });

    it("does not list another user's notes", async () => {
      await register('Ada', 'ada@example.com');
      await register('Tunde', 'tunde@example.com');
      const ada = await login('ada@example.com');
      const tunde = await login('tunde@example.com');

      await request(app.getHttpServer())
        .post('/notes')
        .set('Authorization', `Bearer ${ada}`)
        .send({ title: 'Private', content: 'secret' });

      const res = await request(app.getHttpServer())
        .get('/notes')
        .set('Authorization', `Bearer ${tunde}`)
        .expect(200);

      expect(res.body.total).toBe(0);
    });

    it('paginates and filters', async () => {
      await register('Ada', 'ada@example.com');
      const token = await login('ada@example.com');

      for (let i = 1; i <= 7; i++) {
        await request(app.getHttpServer())
          .post('/notes')
          .set('Authorization', `Bearer ${token}`)
          .send({ title: i <= 3 ? `Meeting ${i}` : `Idea ${i}`, content: 'x' });
      }

      const page = await request(app.getHttpServer())
        .get('/notes?page=2&limit=3')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(page.body.items).toHaveLength(3);
      expect(page.body.total).toBe(7);
      expect(page.body.totalPages).toBe(3);

      const search = await request(app.getHttpServer())
        .get('/notes?search=MEETING')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(search.body.total).toBe(3);

      await request(app.getHttpServer())
        .get('/notes?limit=500')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('roles', () => {
    it('blocks a normal user from listing users with 403', async () => {
      await register('Ada', 'ada@example.com');
      const token = await login('ada@example.com');
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('lets an admin list users', async () => {
      await register('Ada', 'ada@example.com');
      await dataSource.query(
        "UPDATE users SET role = 'admin' WHERE email = 'ada@example.com'",
      );
      const token = await login('ada@example.com');

      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body[0].password).toBeUndefined();
    });
  });
});
