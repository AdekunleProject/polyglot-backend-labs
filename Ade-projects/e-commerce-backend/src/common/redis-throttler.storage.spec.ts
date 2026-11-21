import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  it('turns the script reply into a throttler record, in seconds', async () => {
    const client = { eval: jest.fn().mockResolvedValue([3, 59_100, 0, 0]) };
    const storage = new RedisThrottlerStorage(client as never);
    const record = await storage.increment('abc', 60_000, 5, 0, 'default');
    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    const args = client.eval.mock.calls[0];
    expect(args[1]).toBe(2);
    expect(args[2]).toBe('throttle:{default:abc}');
    expect(args[3]).toBe('throttle:{default:abc}:block');
    expect(args.slice(4)).toEqual(['60000', '5', '0']);
  });

  it('reports a block', async () => {
    const client = { eval: jest.fn().mockResolvedValue([6, 1000, 1, 30_000]) };
    const record = await new RedisThrottlerStorage(client as never).increment(
      'k', 1000, 5, 30_000, 'default',
    );
    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(30);
  });

  it('counts in memory when Redis fails, instead of throwing', async () => {
    const client = { eval: jest.fn().mockRejectedValue(new Error('down')) };
    const storage = new RedisThrottlerStorage(client as never);
    const first = await storage.increment('k', 60_000, 2, 0, 'default');
    const second = await storage.increment('k', 60_000, 2, 0, 'default');
    const third = await storage.increment('k', 60_000, 2, 0, 'default');
    // Counting still works (no throw). The exact number past the limit differs
    // between @nestjs/throttler versions, so only the limit itself is checked.
    expect([first.totalHits, second.totalHits]).toEqual([1, 2]);
    expect(third.totalHits > 2 || third.isBlocked).toBe(true);
    storage.onApplicationShutdown();
  });
});
