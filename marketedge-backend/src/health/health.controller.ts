import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

@Controller()
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is up. Docker and Kubernetes restart on failure. */
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  /** Readiness: MongoDB and Redis answer. Kubernetes stops sending traffic on failure. */
  @Get('ready')
  async ready() {
    const mongo = this.connection.readyState === 1;
    let redis = false;
    try {
      redis = (await this.redis.ping()) === 'PONG';
    } catch {
      redis = false;
    }

    if (!mongo || !redis) {
      throw new ServiceUnavailableException({ status: 'unavailable', mongo, redis });
    }
    return { status: 'ready', mongo, redis };
  }
}
