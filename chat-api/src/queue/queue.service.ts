import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

export type JobHandler = (name: string, data: any) => Promise<void>;

export interface AddOptions {
  attempts?: number;
  backoffMs?: number;
  delayMs?: number;
}

/**
 * Background jobs. With REDIS_URL set (and not in tests) jobs go through BullMQ:
 * they survive a restart, are retried with backoff, and a scheduled job runs
 * once across all replicas. Without Redis the same jobs run in this process,
 * once, with no retry, so local development and the tests need nothing extra.
 * Never put a secret (a password, a token) in job data: it is stored in Redis.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly connections: Redis[] = [];
  private readonly url?: string;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');
    const off = this.config.get('QUEUES') === 'off' || this.config.get('NODE_ENV') === 'test';
    this.url = url && !off ? url : undefined;
  }

  get enabled() {
    return Boolean(this.url);
  }

  private connection() {
    // BullMQ needs unlimited retries on its blocking connection.
    const redis = new Redis(this.url as string, { maxRetriesPerRequest: null });
    redis.on('error', () => undefined);
    this.connections.push(redis);
    return redis;
  }

  private queue(name: string) {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection() });
      queue.on('error', () => undefined);
      this.queues.set(name, queue);
    }
    return queue;
  }

  /** One handler per queue; it receives the job name and data. */
  register(queueName: string, handler: JobHandler) {
    this.handlers.set(queueName, handler);
    if (!this.enabled || this.workers.has(queueName)) return;
    const worker = new Worker(queueName, async (job) => handler(job.name, job.data), {
      connection: this.connection(),
      concurrency: 5,
    });
    worker.on('failed', (job, error) =>
      this.logger.warn(`${queueName}/${job?.name} failed (attempt ${job?.attemptsMade}): ${error.message}`),
    );
    worker.on('error', () => undefined);
    this.workers.set(queueName, worker);
  }

  async add(queueName: string, name: string, data: unknown, options: AddOptions = {}) {
    if (!this.enabled) {
      const handler = this.handlers.get(queueName);
      if (!handler) return;
      setTimeout(() => {
        handler(name, data).catch((error: Error) => this.logger.warn(`${queueName}/${name} failed: ${error.message}`));
      }, options.delayMs ?? 0).unref();
      return;
    }
    await this.queue(queueName).add(name, data, {
      attempts: options.attempts ?? 1,
      backoff: { type: 'exponential', delay: options.backoffMs ?? 5000 },
      delay: options.delayMs,
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  /** Runs `name` every `everyMs`. One run across all replicas when Redis is on. */
  async schedule(queueName: string, name: string, everyMs: number, data: unknown = {}) {
    if (this.enabled) {
      await this.queue(queueName).upsertJobScheduler(name, { every: everyMs }, {
        name,
        data,
        opts: { removeOnComplete: 20, removeOnFail: 50 },
      });
      return;
    }
    if (this.config.get('NODE_ENV') === 'test') return;
    const handler = this.handlers.get(queueName);
    if (!handler) return;
    const timer = setInterval(() => {
      handler(name, data).catch((error: Error) => this.logger.error(`${queueName}/${name} failed: ${error.message}`));
    }, everyMs);
    timer.unref();
    this.timers.push(timer);
  }

  /** For tests and health checks: how many jobs are waiting or delayed. */
  async pending(queueName: string) {
    if (!this.enabled) return 0;
    const counts = await this.queue(queueName).getJobCounts('waiting', 'delayed', 'active');
    return counts.waiting + counts.delayed + counts.active;
  }

  async onModuleDestroy() {
    this.timers.forEach((t) => clearInterval(t));
    await Promise.allSettled([...this.workers.values()].map((w) => w.close()));
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
    this.connections.forEach((c) => c.disconnect());
  }
}
