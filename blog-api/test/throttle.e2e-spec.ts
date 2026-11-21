/**
 * The limits on the sign-in style routes, with the real (not raised) numbers.
 * Needs the same PostgreSQL as app.e2e-spec.ts.
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

describe('Rate limiting (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // The limits are read when the app code is loaded, so lower them first and
    // load the app afterwards.
    process.env.THROTTLE_MULTIPLIER = '1';
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/app.setup');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers 429 with Retry-After once login is tried too often', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@e2e.test', password: 'Whatever-1!' });

    for (let i = 0; i < 5; i++) {
      expect((await attempt()).status).toBe(401);
    }
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('limits per email address even when the requests come from different addresses', async () => {
    // Trust X-Forwarded-For so each request can pretend to be a new client.
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    const attempt = (email: string, ip: string) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email, password: 'Whatever-1!' });

    for (let i = 1; i <= 5; i++) {
      expect((await attempt('victim@e2e.test', `10.0.0.${i}`)).status).toBe(401);
    }
    expect((await attempt('victim@e2e.test', '10.0.0.99')).status).toBe(429);
    // Another account from the same address is unaffected.
    expect((await attempt('other@e2e.test', '10.0.0.99')).status).toBe(401);
  });

  it('never limits the health probes', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
    }
  });
});
