import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import { Connection } from 'mongoose';
import { AppService } from './app.service';

const READY_CHECK_TIMEOUT_MS = 2000;

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Liveness: the process is up. Restarting the pod is the right response if
  // this fails, so it must not depend on anything outside the process.
  @SkipThrottle()
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  // Readiness: the app can do useful work, which needs MongoDB. While this
  // fails, Kubernetes stops sending traffic to the pod but does not kill it.
  @SkipThrottle()
  @Get('ready')
  async ready(): Promise<{ status: string; mongo: boolean }> {
    let mongo = false;
    let timer: NodeJS.Timeout | undefined;
    try {
      if (this.connection.readyState === 1 && this.connection.db) {
        await Promise.race([
          this.connection.db.admin().ping(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('MongoDB ping timed out')),
              READY_CHECK_TIMEOUT_MS,
            );
          }),
        ]);
        mongo = true;
      }
    } catch {
      mongo = false;
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!mongo) {
      throw new ServiceUnavailableException({ status: 'not ready', mongo });
    }
    return { status: 'ready', mongo };
  }
}
