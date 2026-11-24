import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { Device } from './entities/device.entity';
import { Notification, NotificationType } from './entities/notification.entity';
import { PushService } from './push.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly push: PushService,
  ) {}

  /** Saves an in-app notification and, if push is on, sends it to the user's phones. */
  async notify(
    userId: number,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    await this.notifications.save(
      this.notifications.create({
        userId,
        type,
        title: title.slice(0, 150),
        body: body.slice(0, 300),
        data: data ?? null,
      }),
    );
    void this.push.send(userId, title, body, data);
  }

  async list(userId: number, cursor: string | undefined, limit: number) {
    const before = cursor ? decodeCursor(cursor) : null;
    const rows = await this.notifications.find({
      where: { userId, ...(before ? { id: LessThan(before) } : {}) },
      order: { id: 'DESC' },
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit ? encodeCursor(items[items.length - 1].id) : null,
    };
  }

  async unreadCount(userId: number) {
    return { unread: await this.notifications.count({ where: { userId, readAt: IsNull() } }) };
  }

  async markRead(userId: number, id: number) {
    const result = await this.notifications.update({ id, userId, readAt: IsNull() }, { readAt: new Date() });
    if (!result.affected) {
      const exists = await this.notifications.existsBy({ id, userId });
      if (!exists) throw new NotFoundException('Notification not found');
    }
    return { message: 'Marked as read' };
  }

  async markAllRead(userId: number) {
    const result = await this.notifications.update({ userId, readAt: IsNull() }, { readAt: new Date() });
    return { marked: result.affected ?? 0 };
  }

  // ---- Push tokens ----

  /** Registers a phone. If the token was on another account (a shared phone), it moves here. */
  async registerDevice(userId: number, token: string, platform: Device['platform']) {
    await this.devices.query(
      `INSERT INTO devices ("userId", token, platform) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET "userId" = EXCLUDED."userId", platform = EXCLUDED.platform, "lastSeenAt" = now()`,
      [userId, token, platform],
    );
    return { message: 'Device registered' };
  }

  async removeDevice(userId: number, token: string) {
    await this.devices.delete({ userId, token });
    return { message: 'Device removed' };
  }
}
