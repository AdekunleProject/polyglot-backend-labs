import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThanOrEqual, Between, Not, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user.type';
import { Comment } from '../comments/entities/comment.entity';
import { Role } from '../common/enums/role.enum';
import { rolesBelow } from '../common/role-policy';
import { Post } from '../posts/entities/post.entity';
import { User } from '../users/entities/user.entity';
import {
  DELETE_ACTIONS,
  evaluateFlags,
  FlagThresholds,
  isOffHours,
  LOOKUP_ACTIONS,
  sumActions,
} from './flags';

const DAY = 24 * 60 * 60 * 1000;

export interface Range {
  from: Date;
  to: Date;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  thresholds(): FlagThresholds {
    const num = (key: string, fallback: number) => {
      const value = Number(this.config.get(key));
      return Number.isFinite(value) ? value : fallback;
    };
    return {
      deletes: num('FLAG_DELETES', 10),
      lookups: num('FLAG_LOOKUPS', 20),
      offHoursStart: num('OFF_HOURS_START', 22),
      offHoursEnd: num('OFF_HOURS_END', 6),
      tzOffsetHours: num('REPORT_TZ_OFFSET_HOURS', 1),
    };
  }

  /** `from` and `to` default to the last 30 days. A period is at most a year. */
  range(from?: string, to?: string): Range {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * DAY);
    if (start > end) throw new BadRequestException('"from" must be before "to"');
    if (end.getTime() - start.getTime() > 366 * DAY) {
      throw new BadRequestException('A report can cover at most one year');
    }
    return { from: start, to: end };
  }

  /**
   * The staff whose work the caller may see: the superadmin sees admins and
   * managers, an admin sees managers, a manager sees only themselves. Everyone
   * sees themselves.
   */
  private async staffFor(actor: AuthUser): Promise<User[]> {
    const below = rolesBelow(actor.role).filter((role) => role !== Role.USER);
    return this.users.find({
      where: [
        { id: actor.id },
        ...(below.length
          ? [{ role: In(below), deletedAt: IsNull() }]
          : []),
      ],
      order: { role: 'ASC', firstname: 'ASC' },
    });
  }

  /** What each person on the team did in a period, with anything unusual flagged. */
  async staffActivity(actor: AuthUser, { from, to }: Range, record = true) {
    const staff = await this.staffFor(actor);
    const thresholds = this.thresholds();
    const entries = await this.audit.between(
      from,
      to,
      staff.map((s) => s.id),
    );
    const rows = staff.map((person) => {
      const mine = entries.filter((e) => e.actorId === person.id);
      const counts: Record<string, number> = {};
      let offHours = 0;
      let lastActionAt: Date | null = null;
      for (const entry of mine) {
        counts[entry.action] = (counts[entry.action] ?? 0) + 1;
        if (isOffHours(entry.createdAt, thresholds)) offHours += 1;
        lastActionAt = entry.createdAt;
      }
      return {
        id: person.id,
        name: `${person.firstname} ${person.lastname}`,
        email: person.email,
        role: person.role,
        isActive: person.isActive,
        twoFactorEnabled: person.twoFactorEnabled,
        totalActions: mine.length,
        lastActionAt,
        deletes: sumActions(counts, DELETE_ACTIONS),
        lookups: sumActions(counts, LOOKUP_ACTIONS),
        offHoursActions: offHours,
        actions: counts,
        flags: evaluateFlags({
          counts,
          offHoursActions: offHours,
          twoFactorEnabled: person.twoFactorEnabled,
          thresholds,
        }),
      };
    });
    if (record) {
      await this.audit.record(actor.id, 'report.view', null, {
        report: 'staff-activity',
      });
    }
    return { from, to, thresholds, staff: rows };
  }

  /** Posts, comments, sign-ups and moderation in a period, with a count per day. */
  async content({ from, to }: Range) {
    const range = Between(from, to);
    const [postsCreated, postsPublished, commentsCreated, newUsers] = await Promise.all([
      this.posts.count({ where: { createdAt: range } }),
      this.posts.count({ where: { createdAt: range, published: true } }),
      this.comments.count({ where: { createdAt: range } }),
      this.users.count({ where: { createdAt: range, role: Role.USER } }),
    ]);
    const perDay = async (table: string) => {
      const rows = await this.users.manager.query(
        `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
         FROM ${table} WHERE "createdAt" BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`,
        [from, to],
      );
      return rows as { day: string; count: number }[];
    };
    const [postsByDay, commentsByDay, moderation] = await Promise.all([
      perDay('posts'),
      perDay('comments'),
      this.audit.countsByAction(from),
    ]);
    return {
      from,
      to,
      totals: { postsCreated, postsPublished, commentsCreated, newUsers },
      postsByDay,
      commentsByDay,
      moderationSince: {
        postsRemoved: moderation['post.remove'] ?? 0,
        commentsRemoved: moderation['comment.remove'] ?? 0,
        postsEdited: moderation['post.edit'] ?? 0,
        usersDeactivated: moderation['user.deactivate'] ?? 0,
        usersDeleted: moderation['user.delete'] ?? 0,
      },
    };
  }

  // ---- Dashboards ----

  private async counts() {
    const live = { deletedAt: IsNull() };
    const week = new Date(Date.now() - 7 * DAY);
    const [posts, published, comments, readers, newReaders7d] = await Promise.all([
      this.posts.count(),
      this.posts.count({ where: { published: true } }),
      this.comments.count(),
      this.users.count({ where: { role: Role.USER, ...live } }),
      this.users.count({
        where: { role: Role.USER, ...live, createdAt: MoreThanOrEqual(week) },
      }),
    ]);
    return {
      posts: { total: posts, published, drafts: posts - published },
      comments: { total: comments },
      users: { total: readers, newLast7Days: newReaders7d },
    };
  }

  private async mine(actor: AuthUser) {
    const from = new Date(Date.now() - 30 * DAY);
    const rows = await this.audit.between(from, new Date(), [actor.id]);
    const byAction: Record<string, number> = {};
    for (const row of rows) byAction[row.action] = (byAction[row.action] ?? 0) + 1;
    return {
      since: from,
      total: rows.length,
      byAction,
      lastActionAt: rows.length ? rows[rows.length - 1].createdAt : null,
    };
  }

  /** Front page for a manager: the content and readers they look after, and their own activity. */
  async managerDashboard(actor: AuthUser) {
    return { ...(await this.counts()), myActivity: await this.mine(actor) };
  }

  async adminDashboard(actor: AuthUser) {
    const month = new Date(Date.now() - 30 * DAY);
    const [base, roles, deactivated, deleted, moderation] = await Promise.all([
      this.managerDashboard(actor),
      this.users
        .createQueryBuilder('u')
        .select('u.role', 'role')
        .addSelect('COUNT(*)', 'count')
        .where('u.deletedAt IS NULL')
        .groupBy('u.role')
        .getRawMany<{ role: string; count: string }>(),
      this.users.count({ where: { isActive: false, deletedAt: IsNull() } }),
      this.users.count({ where: { deletedAt: Not(IsNull()) } }),
      this.audit.countsByAction(month),
    ]);
    return {
      ...base,
      accounts: {
        byRole: Object.fromEntries(roles.map((r) => [r.role, Number(r.count)])),
        deactivated,
        deleted,
      },
      moderationLast30Days: {
        postsRemoved: moderation['post.remove'] ?? 0,
        commentsRemoved: moderation['comment.remove'] ?? 0,
        postsEdited: moderation['post.edit'] ?? 0,
      },
    };
  }

  async superadminDashboard(actor: AuthUser) {
    const week = new Date(Date.now() - 7 * DAY);
    const [base, staffWithoutTwoFactor, recent, last7Days] = await Promise.all([
      this.adminDashboard(actor),
      this.users.find({
        where: {
          role: In([Role.SUPERADMIN, Role.ADMIN, Role.MANAGER]),
          twoFactorEnabled: false,
          isActive: true,
          deletedAt: IsNull(),
        },
        select: { id: true, firstname: true, lastname: true, email: true, role: true },
      }),
      this.audit.recent(10),
      this.audit.countsByAction(week),
    ]);
    return {
      ...base,
      staffWithoutTwoFactor,
      activity: { last7DaysByAction: last7Days, recent },
    };
  }
}
