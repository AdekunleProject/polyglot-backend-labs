import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, MoreThanOrEqual, Repository, In } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.role_change'
  | 'user.deactivate'
  | 'user.activate'
  | 'user.delete'
  | 'user.restore'
  | 'user.view_messages'
  | 'user.block'
  | 'user.report'
  | 'auth.device_link'
  | 'auth.phone_login'
  | 'auth.phone_add'
  | 'contact.scan'
  | 'contact.qr_reset'
  | 'chat.remove_message'
  | 'chat.remove_member';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly logs: Repository<AuditLog>,
  ) {}

  /** Never put passwords, codes or tokens in `details`. */
  async record(
    actorId: number | null,
    action: AuditAction,
    targetUserId: number | null,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.logs.save(
      this.logs.create({ actorId, action, targetUserId, details: details ?? null }),
    );
  }

  async list(page: number, limit: number) {
    const [items, total] = await this.logs.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  /** Every entry by the given people in a period. The caller works out the totals. */
  async between(from: Date, to: Date, actorIds: number[]) {
    if (actorIds.length === 0) return [];
    return this.logs.find({
      where: { actorId: In(actorIds), createdAt: Between(from, to) },
      select: { actorId: true, action: true, createdAt: true },
      order: { createdAt: 'ASC' },
      take: 100_000,
    });
  }

  async recent(limit: number) {
    return this.logs.find({ order: { id: 'DESC' }, take: limit });
  }

  /** The whole company's actions since `from`, counted by action. */
  async countsByAction(from: Date): Promise<Record<string, number>> {
    const rows = await this.logs
      .createQueryBuilder('log')
      .select('log.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt >= :from', { from })
      .groupBy('log.action')
      .getRawMany<{ action: string; count: string }>();
    return Object.fromEntries(rows.map((row) => [row.action, Number(row.count)]));
  }

  async lastOf(action: AuditAction) {
    return this.logs.findOne({ where: { action }, order: { id: 'DESC' } });
  }

  async sinceCount(action: AuditAction, from: Date) {
    return this.logs.count({ where: { action, createdAt: MoreThanOrEqual(from) } });
  }
}
