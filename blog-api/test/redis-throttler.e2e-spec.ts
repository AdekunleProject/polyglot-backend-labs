/**
 * Runs the real Lua script against a real Redis. Skipped unless REDIS_TEST_URL is
 * set:  docker run -d --name it-redis -p 6380:6379 redis:7-alpine
 *       REDIS_TEST_URL=redis://localhost:6380 TEST_DB_PORT=5433 pnpm test:e2e
 */
import { Redis } from 'ioredis';
import { RedisThrottlerStorage } from '../src/common/redis-throttler.storage';

const url = process.env.REDIS_TEST_URL;
const suite = url ? describe : describe.skip;

suite('RedisThrottlerStorage against a real Redis', () => {
  let client: Redis;
  let storage: RedisThrottlerStorage;
  const unique = () => `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  beforeAll(() => {
    client = new Redis(url as string);
    storage = new RedisThrottlerStorage(client);
  });
  afterAll(async () => {
    await client.quit();
  });

  it('counts hits and reports the time left', async () => {
    const key = unique();
    const one = await storage.increment(key, 60_000, 3, 0, 'default');
    const two = await storage.increment(key, 60_000, 3, 0, 'default');
    expect([one.totalHits, two.totalHits]).toEqual([1, 2]);
    expect(two.timeToExpire).toBeGreaterThan(55);
    expect(two.isBlocked).toBe(false);
  });

  it('blocks once the limit is passed when a block duration is set', async () => {
    const key = unique();
    for (let i = 0; i < 3; i++) await storage.increment(key, 60_000, 3, 30_000, 'default');
    const over = await storage.increment(key, 60_000, 3, 30_000, 'default');
    expect(over.isBlocked).toBe(true);
    expect(over.timeToBlockExpire).toBeGreaterThan(25);
  });

  it('starts counting again after the window', async () => {
    const key = unique();
    await storage.increment(key, 1000, 3, 0, 'default');
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const again = await storage.increment(key, 1000, 3, 0, 'default');
    expect(again.totalHits).toBe(1);
  });

  it('counts concurrent requests exactly', async () => {
    const key = unique();
    const records = await Promise.all(
      Array.from({ length: 25 }, () => storage.increment(key, 60_000, 100, 0, 'default')),
    );
    expect(Math.max(...records.map((r) => r.totalHits))).toBe(25);
    expect(new Set(records.map((r) => r.totalHits)).size).toBe(25);
  });
});
