/**
 * Runs BullMQ against a real Redis. Skipped unless REDIS_TEST_URL is set:
 *   docker run -d --name it-redis -p 6380:6379 redis:7-alpine
 *   REDIS_TEST_URL=redis://localhost:6380 pnpm test:e2e
 */
import { ConfigService } from '@nestjs/config';
import { QueueService } from '../src/queue/queue.service';

const url = process.env.REDIS_TEST_URL;
const suite = url ? describe : describe.skip;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await wait(50);
};

suite('QueueService against a real Redis', () => {
  let queue: QueueService;
  const name = () => `it-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  beforeAll(() => {
    queue = new QueueService(new ConfigService({ NODE_ENV: 'production', REDIS_URL: url }));
  });
  afterAll(async () => {
    await queue.onModuleDestroy();
  });

  it('is on', () => {
    expect(queue.enabled).toBe(true);
  });

  it('delivers a job to its handler', async () => {
    const q = name();
    const seen: unknown[] = [];
    queue.register(q, async (jobName, data) => {
      seen.push([jobName, data]);
    });
    await queue.add(q, 'send', { userId: 7 });
    await until(() => seen.length > 0);
    expect(seen).toEqual([['send', { userId: 7 }]]);
  });

  it('retries a failing job with backoff until it works', async () => {
    const q = name();
    let tries = 0;
    queue.register(q, async () => {
      tries += 1;
      if (tries < 3) throw new Error('Expo is down');
    });
    await queue.add(q, 'send', {}, { attempts: 4, backoffMs: 40 });
    await until(() => tries >= 3);
    expect(tries).toBe(3);
    await wait(300);
    expect(tries).toBe(3);
  });

  it('gives up after the attempts are used', async () => {
    const q = name();
    let tries = 0;
    queue.register(q, async () => {
      tries += 1;
      throw new Error('always');
    });
    await queue.add(q, 'send', {}, { attempts: 2, backoffMs: 30 });
    await until(() => tries >= 2);
    await wait(400);
    expect(tries).toBe(2);
  });

  it('runs a scheduled job repeatedly, and one scheduler per name', async () => {
    const q = name();
    let runs = 0;
    queue.register(q, async () => {
      runs += 1;
    });
    await queue.schedule(q, 'every', 150);
    await queue.schedule(q, 'every', 150);
    await until(() => runs >= 3);
    expect(runs).toBeGreaterThanOrEqual(3);
  });
});
