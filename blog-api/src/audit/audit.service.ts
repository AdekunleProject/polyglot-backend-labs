import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.role_change'
  | 'user.deactivate'
  | 'user.activate'
  | 'user.delete'
  | 'user.restore'
  | 'user.view_posts'
  | 'user.view_comments'
  | 'post.edit'
  | 'post.remove'
  | 'comment.remove';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly logs: Repository<AuditLog>,
  ) {}

  /** Never put passwords, codes or tokens in `details`. */
  async record(
    actorId: number,
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
}
