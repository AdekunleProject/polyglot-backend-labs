import { ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('QueueService without Redis', () => {
  const make = (extra: Record<string, string> = {}) => new QueueService(new ConfigService({ NODE_ENV: 'production', ...extra }));

  it('is off without REDIS_URL, in tests, and when switched off', () => {
    expect(make().enabled).toBe(false);
    expect(make({ REDIS_URL: 'redis://localhost:6379', NODE_ENV: 'test' }).enabled).toBe(false);
    expect(make({ REDIS_URL: 'redis://localhost:6379', QUEUES: 'off' }).enabled).toBe(false);
  });

  it('runs a job in this process, once', async () => {
    const queue = make();
    const seen: unknown[] = [];
    queue.register('inline', async (name, data) => {
      seen.push([name, data]);
    });
    await queue.add('inline', 'hello', { n: 1 });
    await wait(30);
    expect(seen).toEqual([['hello', { n: 1 }]]);
  });

  it('does not throw when a job fails or when nothing handles it', async () => {
    const queue = make();
    queue.register('boom', async () => {
      throw new Error('nope');
    });
    await expect(queue.add('boom', 'x', {})).resolves.toBeUndefined();
    await expect(queue.add('nobody', 'x', {})).resolves.toBeUndefined();
    await wait(30);
  });

  it('runs a scheduled job on a timer', async () => {
    const queue = make();
    let runs = 0;
    queue.register('tick', async () => {
      runs += 1;
    });
    await queue.schedule('tick', 'every', 20);
    await wait(110);
    await queue.onModuleDestroy();
    expect(runs).toBeGreaterThanOrEqual(2);
  });
});
