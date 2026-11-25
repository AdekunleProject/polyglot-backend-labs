import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * A block works both ways: neither of you can message, call, pay, see the
 * other's status or find them by QR code. Group chats you share are not affected.
 */
@Injectable()
export class BlocksService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async isBlocked(a: number, b: number): Promise<boolean> {
    const rows = (await this.db.query(
      `SELECT 1 FROM blocks WHERE ("blockerId" = $1 AND "blockedId" = $2) OR ("blockerId" = $2 AND "blockedId" = $1)`,
      [a, b],
    )) as unknown[];
    return rows.length > 0;
  }

  /** The same answer whichever side blocked, so a block does not reveal who did it. */
  async assertCanInteract(a: number, b: number) {
    if (await this.isBlocked(a, b)) throw new ForbiddenException('You cannot interact with this person');
  }

  async block(me: number, userId: number) {
    if (me === userId) throw new BadRequestException('You cannot block yourself');
    const exists = (await this.db.query(`SELECT 1 FROM users WHERE id = $1 AND "deletedAt" IS NULL`, [userId])) as unknown[];
    if (exists.length === 0) throw new NotFoundException('User not found');
    await this.db.query(`INSERT INTO blocks ("blockerId", "blockedId") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      me,
      userId,
    ]);
    return { blocked: true };
  }

  async unblock(me: number, userId: number) {
    await this.db.query(`DELETE FROM blocks WHERE "blockerId" = $1 AND "blockedId" = $2`, [me, userId]);
    return { blocked: false };
  }

  /** Only the people you blocked, never who blocked you. */
  list(me: number) {
    return this.db.query(
      `SELECT u.id, u.username, u.firstname, u.lastname, b."createdAt"
       FROM blocks b JOIN users u ON u.id = b."blockedId" WHERE b."blockerId" = $1 ORDER BY b."createdAt" DESC`,
      [me],
    );
  }
}
