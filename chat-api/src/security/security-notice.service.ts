import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PushService } from '../devices/push.service';
import { MailService } from '../mail/mail.service';
import { RealtimeService } from '../realtime/realtime.service';

/**
 * Tells a person when a new device got into their account: an email, a
 * phone notification and a live event on their other devices. It never
 * throws, so an alert problem cannot block a sign-in.
 */
@Injectable()
export class SecurityNoticeService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly mail: MailService,
    private readonly push: PushService,
    private readonly realtime: RealtimeService,
  ) {}

  async newDevice(userId: number, deviceName: string | null, how: 'qr' | 'phone') {
    try {
      const rows = (await this.db.query(`SELECT email FROM users WHERE id = $1`, [userId])) as {
        email: string;
      }[];
      const name = deviceName || 'A new device';
      const via = how === 'qr' ? 'by scanning a QR code' : 'with a phone number code';
      this.realtime.emitToUsers([userId], 'security:new-device', { deviceName: name, how });
      await this.push.send(userId, 'New device signed in', `${name} signed in ${via}.`, {
        type: 'security',
      });
      if (rows[0]?.email) {
        await this.mail.sendEmail(
          rows[0].email,
          'New device signed in to your account',
          `${name} signed in ${via}. If this was not you, open the app, go to Devices and sign it out, then change your password.`,
        );
      }
    } catch {
      // An alert problem must never block the sign-in.
    }
  }
}
