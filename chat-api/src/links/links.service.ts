import { BadRequestException, GoneException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { SecurityNoticeService } from '../security/security-notice.service';
import { User } from '../users/entities/user.entity';
import { rowsOf } from '../common/rows-of';

const LINK_TTL_SECONDS = 120;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * Open your chats on a laptop by scanning a QR code with the phone that is
 * already signed in:
 *   1. the laptop asks for a link and shows "<linkId>.<secret>" as a QR code
 *   2. the phone scans it, sees the device name and approves
 *   3. the laptop, polling, receives its own session (never the phone's)
 * The secret exists only inside the QR code, so a link id alone is useless.
 */
@Injectable()
export class LinksService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auth: AuthService,
    private readonly notice: SecurityNoticeService,
    private readonly audit: AuditService,
  ) {}

  async start(deviceName: string) {
    const id = randomUUID();
    const secret = randomBytes(24).toString('base64url');
    await this.db.query(`DELETE FROM device_links WHERE "expiresAt" < now() - interval '1 day'`);
    await this.db.query(
      `INSERT INTO device_links (id, "secretHash", "deviceName", "expiresAt")
       VALUES ($1, $2, $3, now() + ($4::int * interval '1 second'))`,
      [id, sha256(secret), deviceName.trim(), LINK_TTL_SECONDS],
    );
    return { linkId: id, secret, qr: `${id}.${secret}`, expiresInSeconds: LINK_TTL_SECONDS };
  }

  /** The laptop asks "was I approved yet?". Tokens are handed over once. */
  async poll(linkId: string, secret: string) {
    const claimed = rowsOf<{ userId: number; deviceName: string }>(
      await this.db.query(
        `UPDATE device_links SET status = 'used'
         WHERE id = $1 AND "secretHash" = $2 AND status = 'approved' AND "expiresAt" > now()
         RETURNING "userId", "deviceName"`,
        [linkId, sha256(secret)],
      ),
    );
    if (claimed[0]) {
      const user = await this.users.findOneBy({ id: claimed[0].userId });
      if (!user || !user.isActive || user.deletedAt) throw new GoneException('This link is no longer valid');
      await this.audit.record(user.id, 'auth.device_link', user.id, { deviceName: claimed[0].deviceName });
      const tokens = await this.auth.signInDevice(user, claimed[0].deviceName);
      await this.notice.newDevice(user.id, claimed[0].deviceName, 'qr');
      return { status: 'approved' as const, ...tokens };
    }

    const rows = (await this.db.query(
      `SELECT status, "expiresAt" > now() AS live FROM device_links WHERE id = $1 AND "secretHash" = $2`,
      [linkId, sha256(secret)],
    )) as { status: string; live: boolean }[];
    const link = rows[0];
    if (!link || !link.live || link.status === 'used') {
      throw new GoneException('This QR code expired. Ask for a new one.');
    }
    return { status: link.status === 'denied' ? ('denied' as const) : ('pending' as const) };
  }

  /** The phone scanned the code and wants to show what is asking to be linked. */
  async inspect(linkId: string, secret: string) {
    const rows = (await this.db.query(
      `SELECT "deviceName", "createdAt", "expiresAt" FROM device_links
       WHERE id = $1 AND "secretHash" = $2 AND status = 'pending' AND "expiresAt" > now()`,
      [linkId, sha256(secret)],
    )) as { deviceName: string; createdAt: Date; expiresAt: Date }[];
    if (!rows[0]) throw new GoneException('This QR code expired. Ask for a new one.');
    return rows[0];
  }

  async approve(userId: number, linkId: string, secret: string) {
    const updated = rowsOf<{ id: string }>(
      await this.db.query(
        `UPDATE device_links SET status = 'approved', "userId" = $3
         WHERE id = $1 AND "secretHash" = $2 AND status = 'pending' AND "expiresAt" > now()
         RETURNING id`,
        [linkId, sha256(secret), userId],
      ),
    );
    if (updated.length === 0) throw new GoneException('This QR code expired. Ask for a new one.');
    return { message: 'Device approved' };
  }

  async deny(linkId: string, secret: string) {
    const updated = rowsOf<{ id: string }>(
      await this.db.query(
        `UPDATE device_links SET status = 'denied'
         WHERE id = $1 AND "secretHash" = $2 AND status = 'pending' RETURNING id`,
        [linkId, sha256(secret)],
      ),
    );
    if (updated.length === 0) throw new BadRequestException('Nothing to deny');
    return { message: 'Device denied' };
  }
}
