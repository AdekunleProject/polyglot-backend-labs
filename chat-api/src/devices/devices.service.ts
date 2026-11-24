import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';

@Injectable()
export class DevicesService {
  constructor(@InjectRepository(Device) private readonly devices: Repository<Device>) {}

  /** Registers a phone. If the token was on another account (a shared phone), it moves here. */
  async register(userId: number, token: string, platform: Device['platform']) {
    await this.devices.query(
      `INSERT INTO devices ("userId", token, platform) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET "userId" = EXCLUDED."userId", platform = EXCLUDED.platform, "lastSeenAt" = now()`,
      [userId, token, platform],
    );
    return { message: 'Device registered' };
  }

  async remove(userId: number, token: string) {
    await this.devices.delete({ userId, token });
    return { message: 'Device removed' };
  }
}
