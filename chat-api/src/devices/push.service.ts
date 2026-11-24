import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Device } from './entities/device.entity';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Sends a phone notification through Expo's push service. Off unless
 * PUSH_PROVIDER=expo. It never throws: a push outage must not break a comment
 * or a like. Not tested against the real service.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly config: ConfigService,
  ) {}

  async send(userId: number, title: string, body: string, data?: Record<string, unknown>) {
    if (this.config.get('PUSH_PROVIDER') !== 'expo') return;
    try {
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
      const result = (await response.json()) as {
        data?: { status: string; details?: { error?: string } }[];
      };

      // A token the phone no longer uses is removed, so it is not tried again.
      const dead = (result.data ?? [])
        .map((ticket, i) => (ticket.details?.error === 'DeviceNotRegistered' ? targets[i].token : null))
        .filter((token): token is string => token !== null);
      if (dead.length > 0) await this.devices.delete({ token: In(dead) });
    } catch (error) {
      this.logger.warn(`Push failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
