import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { AuditLog } from './schemas/audit-log.schema';

export type AuditAction =
  | 'user.create'
  | 'user.view'
  | 'user.update'
  | 'user.role_change'
  | 'user.deactivate'
  | 'user.activate'
  | 'user.delete'
  | 'user.restore';

export interface AuditTarget {
  type: string;
  id: string;
}

export interface AuditFilter {
  actorId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private readonly logs: Model<AuditLog>,
  ) {}

  /** Never put passwords, codes or tokens in `details`. */
  async record(
    actorId: string,
    action: AuditAction | (string & {}),
    target?: AuditTarget,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.logs.create({
      actorId: new Types.ObjectId(actorId),
      action,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
      details: details ?? null,
    });
  }

  async list(page: number, limit: number, filter: AuditFilter = {}) {
    const query: FilterQuery<AuditLog> = {};
    if (filter.actorId) query.actorId = new Types.ObjectId(filter.actorId);
    if (filter.action) query.action = filter.action;
    if (filter.from || filter.to) {
      query.createdAt = {
        ...(filter.from ? { $gte: filter.from } : {}),
        ...(filter.to ? { $lte: filter.to } : {}),
      };
    }
    const [items, total] = await Promise.all([
      this.logs
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.logs.countDocuments(query),
    ]);
    return { items, total, page, limit };
  }
}
