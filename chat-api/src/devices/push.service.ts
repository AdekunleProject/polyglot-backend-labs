import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { QueueService } from '../queue/queue.service';
import { Device } from './entities/device.entity';

interface PushJob {
  userId: number;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Sends a phone notification through Expo's push service. Off unless
 * PUSH_PROVIDER=expo. send() queues the notification (retried with backoff when
 * Redis is on) and never throws. Not tested against the real service.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly config: ConfigService,
    private readonly queue: QueueService,
  ) {}

  onModuleInit() {
    this.queue.register('push', async (_name, job: PushJob) => this.deliver(job));
  }

  /** Queues a notification. It never throws: a push outage must not break a send. */
  async send(userId: number, title: string, body: string, data?: Record<string, unknown>) {
    if (this.config.get('PUSH_PROVIDER') !== 'expo') return;
    try {
      await this.queue.add('push', 'send', { userId, title, body, data }, { attempts: 5, backoffMs: 5000 });
    } catch (error) {
      this.logger.warn(`Could not queue push: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** The real delivery. It throws when Expo cannot be reached, so the queue retries. */
  async deliver({ userId, title, body, data }: PushJob) {
    const devices = await this.devices.find({ where: { userId } });
    const targets = devices.filter((d) => /^Expo(nent)?PushToken\[.+\]$/.test(d.token));
    if (targets.length === 0) return;

    const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN');
    const response = await fetch(EXPO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(
        targets.map((d) => ({ to: d.token, title, body, data, sound: 'default' })),
      ),
    });
    if (response.status >= 500 || response.status === 429) {
      throw new Error(`Expo answered ${response.status}`);
    }
    const result = (await response.json()) as {
      data?: { status: string; details?: { error?: string } }[];
    };

    // A token the phone no longer uses is removed, so it is not tried again.
    const dead = (result.data ?? [])
      .map((ticket, i) => (ticket.details?.error === 'DeviceNotRegistered' ? targets[i].token : null))
      .filter((token): token is string => token !== null);
    if (dead.length > 0) await this.devices.delete({ token: In(dead) });
  }
}
