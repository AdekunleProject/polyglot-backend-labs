import { Logger } from '@nestjs/common';
import {
  ThrottlerStorage,
  ThrottlerStorageService,
  type ThrottlerStorageRecord,
} from '@nestjs/throttler';
import type { Redis } from 'ioredis';

// One round trip, and atomic, so replicas never miscount. KEYS[1] counts hits,
// KEYS[2] marks a block. Both carry the same {hash tag}, so they live in one
// slot if Redis is ever clustered.
const INCREMENT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  return {hits, redis.call('PTTL', KEYS[1]), 1, blockTtl}
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {hits, ttl, 1, tonumber(ARGV[3])}
end
return {hits, ttl, 0, 0}
`;

const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

/**
 * Rate limit counters in Redis, so every replica of the API shares them. With
 * the default in-memory storage each pod counts alone, and N pods allow N
 * times the limit.
 *
 * If Redis cannot be reached the limiter falls back to in-memory counting on
 * that instance, rather than rejecting everybody or turning limits off.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private fallback?: ThrottlerStorageService;
  private lastWarning = 0;

  constructor(private readonly client: Pick<Redis, 'eval'>) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `throttle:{${throttlerName}:${key}}`;
    try {
      const reply = (await this.client.eval(
        INCREMENT,
        2,
        base,
        `${base}:block`,
        String(ttl),
        String(limit),
        String(blockDuration),
      )) as [number, number, number, number];
      const [hits, ttlMs, blocked, blockMs] = reply.map(Number);
      return {
        totalHits: hits,
        timeToExpire: seconds(ttlMs),
        isBlocked: blocked === 1,
        timeToBlockExpire: seconds(blockMs),
      };
    } catch (error) {
      if (Date.now() - this.lastWarning > 60_000) {
        this.lastWarning = Date.now();
        this.logger.warn(
          `Redis is unreachable, counting in memory on this instance: ${(error as Error).message}`,
        );
      }
      this.fallback ??= new ThrottlerStorageService();
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  onApplicationShutdown(): void {
    this.fallback?.onApplicationShutdown?.();
  }
}
