import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppService } from './app.service';

const READY_CHECK_TIMEOUT_MS = 2000;

// Probes come from the cluster every few seconds and must never be limited.
@SkipThrottle()
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Liveness: the process is up. Restarting the pod is the right response if
  // this fails, so it must not depend on anything outside the process.
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  // Readiness: the app can do useful work, which needs PostgreSQL. While this
  // fails, Kubernetes stops sending traffic to the pod but does not kill it.
  @Get('ready')
  async ready(): Promise<{ status: string; database: boolean }> {
    let database = false;
    let timer: NodeJS.Timeout | undefined;
    try {
      if (this.dataSource.isInitialized) {
        await Promise.race([
          this.dataSource.query('SELECT 1'),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Database ping timed out')),
              READY_CHECK_TIMEOUT_MS,
            );
          }),
        ]);
        database = true;
      }
    } catch {
      database = false;
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!database) {
      throw new ServiceUnavailableException({ status: 'not ready', database });
    }
    return { status: 'ready', database };
  }
}
