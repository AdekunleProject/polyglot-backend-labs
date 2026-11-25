import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user.type';
import { ConversationsService } from '../chat/conversations.service';
import { MediaService, StoredMedia } from '../chat/media.service';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { rowsOf } from '../common/rows-of';
import { PushService } from '../devices/push.service';
import { RealtimeService } from '../realtime/realtime.service';
import { VISIBLE_TO_1 } from '../status/status.service';
import { UsersService } from '../users/users.service';
import type { CreateReportDto, DecideReportDto, ListReportsQueryDto } from './dto/reports.dto';

export interface ReportRow {
  id: number;
  reporterId: number;
  targetType: 'user' | 'message' | 'status';
  targetId: number;
  accusedId: number;
  conversationId: string | null;
  category: string;
  reason: string;
  evidence: unknown;
  status: 'open' | 'reviewed' | 'dismissed' | 'actioned';
  reviewValid: boolean | null;
  reviewNote: string | null;
  reviewedById: number | null;
  reviewedAt: Date | null;
  decision: string | null;
  decisionReason: string | null;
  decidedById: number | null;
  decidedAt: Date | null;
  createdAt: Date;
}

const MAX_REPORTS_PER_HOUR = 10;

/**
 * Report a person, a message or a status, with a reason. A manager checks
 * the evidence, an admin decides, and everything is audited. The evidence is
 * a copy taken when the report was made, so deleting the message afterwards
 * does not make the report disappear.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly conversations: ConversationsService,
    private readonly media: MediaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
  ) {}

  // ---- Report ----

  async create(me: number, dto: CreateReportDto) {
    const recent = (await this.db.query(
      `SELECT COUNT(*)::int AS total FROM reports WHERE "reporterId" = $1 AND "createdAt" > now() - interval '1 hour'`,
      [me],
    )) as { total: number }[];
    if (recent[0].total >= MAX_REPORTS_PER_HOUR) {
      throw new HttpException('You have sent many reports. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const target = await this.resolveTarget(me, dto.targetType, dto.targetId);
    if (target.accusedId === me) throw new BadRequestException('You cannot report yourself');

    try {
      const rows = rowsOf<{ id: number }>(
        await this.db.query(
          `INSERT INTO reports ("reporterId", "targetType", "targetId", "accusedId", "conversationId", category, reason, evidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            me,
            dto.targetType,
            dto.targetId,
            target.accusedId,
            target.conversationId,
            dto.category,
            dto.reason.trim(),
            JSON.stringify(target.evidence),
          ],
        ),
      );
      await this.audit.record(me, 'user.report', target.accusedId, {
        reportId: rows[0].id,
        targetType: dto.targetType,
        category: dto.category,
      });
      return { id: rows[0].id, status: 'open' as const };
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('You already reported this and it is still being looked at');
      }
      throw error;
    }
  }

  /** Finds what is being reported, checks the reporter may see it, and copies the evidence. */
  private async resolveTarget(me: number, type: 'user' | 'message' | 'status', id: number) {
    if (type === 'user') {
      const rows = (await this.db.query(
        `SELECT id, username, firstname, lastname FROM users WHERE id = $1 AND "deletedAt" IS NULL`,
        [id],
      )) as Record<string, unknown>[];
      if (!rows[0]) throw new NotFoundException('User not found');
      return { accusedId: id, conversationId: null as string | null, evidence: { user: rows[0] } };
    }

    if (type === 'message') {
      const rows = (await this.db.query(`SELECT * FROM messages WHERE id = $1`, [id])) as {
        id: number;
        conversationId: string;
        senderId: number | null;
        type: string;
        body: string | null;
        media: Record<string, unknown> | null;
        createdAt: Date;
        deletedAt: Date | null;
      }[];
      const message = rows[0];
      if (!message) throw new NotFoundException('Message not found');
      const mine = await this.conversations.requireMember(message.conversationId, me);
      if (!message.senderId) throw new BadRequestException('System messages cannot be reported');
      if (message.deletedAt) throw new BadRequestException('That message was deleted');

      // The reporter's view of the chat around it, so the staff can judge it in context.
      const context = await this.db.query(
        `SELECT id, "senderId", type, body, "createdAt" FROM messages
         WHERE "conversationId" = $1 AND id < $2 AND "deletedAt" IS NULL AND "createdAt" >= $3
         ORDER BY id DESC LIMIT 3`,
        [message.conversationId, id, mine.joinedAt],
      );
      return {
        accusedId: message.senderId,
        conversationId: message.conversationId,
        evidence: {
          message: {
            id: message.id,
            senderId: message.senderId,
            type: message.type,
            body: message.body,
            file: message.media
              ? { kind: message.media.kind, name: message.media.name, contentType: message.media.contentType, size: message.media.size }
              : null,
            createdAt: message.createdAt,
          },
          before: (context as unknown[]).reverse(),
        },
      };
    }

    const rows = (await this.db.query(`SELECT s.* FROM statuses s WHERE s.id = $2 AND ${VISIBLE_TO_1}`, [me, id])) as {
      userId: number;
      type: string;
      body: string | null;
      media: Record<string, unknown> | null;
      createdAt: Date;
    }[];
    if (!rows[0]) throw new NotFoundException('Status not found');
    return {
      accusedId: rows[0].userId,
      conversationId: null as string | null,
      evidence: {
        status: {
          id,
          type: rows[0].type,
          body: rows[0].body,
          file: rows[0].media ? { kind: rows[0].media.kind, contentType: rows[0].media.contentType, size: rows[0].media.size } : null,
          createdAt: rows[0].createdAt,
        },
      },
    };
  }

  // ---- The reporter's own view ----

  async mine(me: number) {
    return this.db.query(
      `SELECT id, "targetType", "targetId", category, reason, status, "decisionReason", "createdAt", "decidedAt"
       FROM reports WHERE "reporterId" = $1 ORDER BY id DESC LIMIT 100`,
      [me],
    );
  }

  // ---- Staff ----

  async list(query: ListReportsQueryDto) {
    let before: number | null = null;
    if (query.cursor) {
      before = decodeCursor(query.cursor);
      if (before === null) throw new BadRequestException('Invalid cursor');
    }
    const rows = (await this.db.query(
      `SELECT r.id, r."targetType", r."targetId", r.category, r.reason, r.status, r."createdAt",
              r."accusedId", acc.username AS "accusedUsername", rep.username AS "reporterUsername",
              (SELECT COUNT(*)::int FROM reports o WHERE o."targetType" = r."targetType" AND o."targetId" = r."targetId") AS "reportsOnTarget",
              (SELECT COUNT(*)::int FROM reports o WHERE o."accusedId" = r."accusedId") AS "reportsOnPerson"
       FROM reports r JOIN users acc ON acc.id = r."accusedId" JOIN users rep ON rep.id = r."reporterId"
       WHERE ($1::text IS NULL OR r.status = $1) AND ($2::text IS NULL OR r."targetType" = $2) AND ($3::int IS NULL OR r.id < $3)
       ORDER BY r.id DESC LIMIT $4`,
      [query.status ?? null, query.targetType ?? null, before, query.limit + 1],
    )) as { id: number }[];
    const page = rows.slice(0, query.limit);
    return { items: page, nextCursor: rows.length > query.limit ? encodeCursor(page[page.length - 1].id) : null };
  }

  /** Opening a report shows private chat content, so it is written to the audit log. */
  async get(actor: AuthUser, id: number) {
    const row = await this.load(id);
    if (row.targetType === 'message') {
      await this.audit.record(actor.id, 'user.view_messages', row.accusedId, { reportId: id });
    }
    return row;
  }

  private async load(id: number): Promise<ReportRow> {
    const rows = (await this.db.query(`SELECT * FROM reports WHERE id = $1`, [id])) as ReportRow[];
    if (!rows[0]) throw new NotFoundException('Report not found');
    return rows[0];
  }

  /** A manager checks the evidence. The decision stays with an admin. */
  async verify(actor: AuthUser, id: number, valid: boolean, note: string) {
    const updated = rowsOf<{ id: number }>(
      await this.db.query(
        `UPDATE reports SET status = 'reviewed', "reviewValid" = $2, "reviewNote" = $3, "reviewedById" = $4, "reviewedAt" = now()
         WHERE id = $1 AND status IN ('open', 'reviewed') RETURNING id`,
        [id, valid, note.trim(), actor.id],
      ),
    );
    if (updated.length === 0) {
      await this.load(id);
      throw new ConflictException('This report was already decided');
    }
    await this.audit.record(actor.id, 'report.verify', null, { reportId: id, valid, note: note.trim() });
    return { id, status: 'reviewed' as const, valid };
  }

  async decide(actor: AuthUser, id: number, dto: DecideReportDto) {
    const report = await this.load(id);
    if (report.status === 'dismissed' || report.status === 'actioned') {
      throw new ConflictException('This report was already decided');
    }
    const removes = dto.decision === 'remove_content' || dto.decision === 'remove_and_suspend';
    const suspends = dto.decision === 'suspend_user' || dto.decision === 'remove_and_suspend';
    if (removes && report.targetType === 'user') {
      throw new BadRequestException('A person is not content. Choose suspend_user or dismiss.');
    }

    // Do the action first: if it is refused (for example the account outranks you), nothing is marked as decided.
    if (removes) await this.removeContent(actor, report, dto.reason);
    if (suspends) {
      await this.users.setActive(report.accusedId, actor, false, `Report #${id}: ${dto.reason.trim()}`);
      this.realtime.disconnectUser(report.accusedId);
    }

    const status = dto.decision === 'dismiss' ? 'dismissed' : 'actioned';
    // Everyone who reported the same thing gets the same outcome, so staff do the work once.
    const closed = rowsOf<{ id: number; reporterId: number }>(
      await this.db.query(
        `UPDATE reports SET status = $3, decision = $4, "decisionReason" = $5, "decidedById" = $6, "decidedAt" = now()
         WHERE "targetType" = $1 AND "targetId" = $2 AND status IN ('open', 'reviewed') RETURNING id, "reporterId"`,
        [report.targetType, report.targetId, status, dto.decision, dto.reason.trim(), actor.id],
      ),
    );
    await this.audit.record(actor.id, 'report.decide', report.accusedId, {
      reportId: id,
      decision: dto.decision,
      reason: dto.reason.trim(),
      alsoClosed: closed.length - 1,
    });
    for (const row of closed) {
      this.realtime.emitToUsers([row.reporterId], 'report:resolved', { reportId: row.id, status });
      void this.push.send(row.reporterId, 'Your report was reviewed', `Outcome: ${status}`, {
        type: 'report',
        reportId: row.id,
      });
    }
    return { id, status, decision: dto.decision };
  }

  private async removeContent(actor: AuthUser, report: ReportRow, reason: string) {
    if (report.targetType === 'message') {
      const rows = rowsOf<{ media: StoredMedia | null }>(
        await this.db.query(
          `UPDATE messages SET "deletedAt" = now(), body = NULL, media = NULL WHERE id = $1 AND "deletedAt" IS NULL RETURNING media`,
          [report.targetId],
        ),
      );
      if (rows[0]) await this.media.discard(rows[0].media);
      if (report.conversationId) {
        this.realtime.emitToUsers(await this.conversations.memberIds(report.conversationId), 'message:deleted', {
          id: report.targetId,
          conversationId: report.conversationId,
        });
      }
      await this.audit.record(actor.id, 'chat.remove_message', report.accusedId, {
        messageId: report.targetId,
        reportId: report.id,
        reason: reason.trim(),
      });
      return;
    }
    const rows = rowsOf<{ media: StoredMedia | null }>(
      await this.db.query(
        `UPDATE statuses SET "deletedAt" = now() WHERE id = $1 AND "deletedAt" IS NULL RETURNING media`,
        [report.targetId],
      ),
    );
    if (rows[0]) await this.media.discard(rows[0].media);
    await this.audit.record(actor.id, 'chat.remove_message', report.accusedId, {
      statusId: report.targetId,
      reportId: report.id,
      reason: reason.trim(),
    });
  }
}
