import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ConversationsService } from '../chat/conversations.service';
import { rowsOf } from '../common/rows-of';

const PREFIX = 'chatqr:';

/**
 * A personal QR code. It holds a signed token with the person's id and a
 * version number, so "reset my QR code" kills every old copy at once.
 * The app draws the QR image from `payload`.
 */
@Injectable()
export class ContactsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly jwt: JwtService,
    private readonly conversations: ConversationsService,
    private readonly audit: AuditService,
  ) {}

  private async mine(userId: number) {
    const rows = (await this.db.query(`SELECT "qrVersion", "qrEnabled" FROM users WHERE id = $1`, [userId])) as {
      qrVersion: number;
      qrEnabled: boolean;
    }[];
    return rows[0];
  }

  async myCode(userId: number) {
    const { qrVersion, qrEnabled } = await this.mine(userId);
    const token = await this.jwt.signAsync({ sub: userId, qv: qrVersion, type: 'contact' });
    return { payload: `${PREFIX}${token}`, enabled: qrEnabled };
  }

  async resetCode(userId: number) {
    await this.db.query(`UPDATE users SET "qrVersion" = "qrVersion" + 1 WHERE id = $1`, [userId]);
    await this.audit.record(userId, 'contact.qr_reset', userId);
    return this.myCode(userId);
  }

  async setEnabled(userId: number, enabled: boolean) {
    await this.db.query(`UPDATE users SET "qrEnabled" = $2 WHERE id = $1`, [userId, enabled]);
    return { enabled };
  }

  /** Who a code belongs to, if it is a live code of somebody else. Used to scan and to pay. */
  async resolve(me: number, code: string) {
    const invalid = new NotFoundException('Invalid or expired code');
    if (!code.startsWith(PREFIX)) throw invalid;
    let payload: { sub: number; qv: number; type: string };
    try {
      payload = await this.jwt.verifyAsync(code.slice(PREFIX.length));
    } catch {
      throw invalid;
    }
    if (payload.type !== 'contact') throw invalid;
    if (payload.sub === me) throw new BadRequestException('That is your own code');

    const rows = rowsOf<{ id: number; username: string; firstname: string; lastname: string }>(
      await this.db.query(
        `SELECT id, username, firstname, lastname FROM users
         WHERE id = $1 AND "isActive" = true AND "deletedAt" IS NULL AND "qrEnabled" = true AND "qrVersion" = $2`,
        [payload.sub, payload.qv],
      ),
    );
    if (!rows[0]) throw invalid;
    return rows[0];
  }

  /** Scanning someone's code opens (or finds) the chat with them. */
  async scan(me: number, code: string) {
    const user = await this.resolve(me, code);
    const conversation = await this.conversations.createDirect(me, user.id);
    await this.audit.record(me, 'contact.scan', user.id);
    return { user, conversation };
  }
}
