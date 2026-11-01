import { Global, Inject, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PUB_SUB, REDIS_CLIENT } from './redis.constants';
import { RedisPubSub } from './redis-pubsub';

export function createRedisClient(config: ConfigService, name: string): Redis {
  const logger = new Logger('Redis');
  const client = new Redis({
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: Number(config.get<string>('REDIS_PORT', '6379')),
    password: config.get<string>('REDIS_PASSWORD') || undefined,
  });
  // Without an error listener, a Redis outage would crash the whole process.
  client.on('error', (error: Error) => logger.error(`${name}: ${error.message}`));
  return client;
}

@Injectable()
export class RedisShutdown implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(PUB_SUB) private readonly pubSub: RedisPubSub,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pubSub.close();
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createRedisClient(config, 'cache'),
    },
    {
      provide: PUB_SUB,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new RedisPubSub(createRedisClient(config, 'publisher'), createRedisClient(config, 'subscriber')),
    },
    RedisShutdown,
  ],
  exports: [REDIS_CLIENT, PUB_SUB],
})
export class RedisModule {}
