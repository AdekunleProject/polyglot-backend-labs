import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user.type';
import { Role } from '../common/enums/role.enum';
import { rolesBelow } from '../common/role-policy';
import { User } from '../users/entities/user.entity';
import { DELETE_ACTIONS, evaluateFlags, FlagThresholds, isOffHours, LOOKUP_ACTIONS, sumActions } from './flags';

const DAY = 24 * 60 * 60 * 1000;

export interface Range {
  from: Date;
  to: Date;
}

type Counted = Record<string, number>;

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly db: DataSource,
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

  private async one<T>(sql: string, params: unknown[] = []): Promise<T> {
    return ((await this.db.query(sql, params)) as T[])[0];
  }

  private async grouped(sql: string, params: unknown[] = []): Promise<Counted> {
    const rows = (await this.db.query(sql, params)) as { key: string; count: number }[];
    return Object.fromEntries(rows.map((r) => [r.key, Number(r.count)]));
  }

  // ---- Staff activity ----

  /**
   * The staff whose work the caller may see: the superadmin sees admins and
   * managers, an admin sees managers, a manager sees only themselves.
   */
  private async staffFor(actor: AuthUser): Promise<User[]> {
    const below = rolesBelow(actor.role).filter((role) => role !== Role.USER);
    return this.users.find({
      where: [{ id: actor.id }, ...(below.length ? [{ role: In(below), deletedAt: IsNull() }] : [])],
      order: { role: 'ASC', firstname: 'ASC' },
    });
  }

  async staffActivity(actor: AuthUser, { from, to }: Range, record = true) {
    const staff = await this.staffFor(actor);
    const thresholds = this.thresholds();
    const entries = await this.audit.between(from, to, staff.map((s) => s.id));
    const rows = staff.map((person) => {
      const mine = entries.filter((e) => e.actorId === person.id);
      const counts: Counted = {};
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
        flags: evaluateFlags({ counts, offHoursActions: offHours, twoFactorEnabled: person.twoFactorEnabled, thresholds }),
      };
    });
    if (record) await this.audit.record(actor.id, 'report.view', null, { report: 'staff-activity' });
    return { from, to, thresholds, staff: rows };
  }

  // ---- Usage over a period ----

  /** Sign-ups, messages, calls, payments and reports in a period, with a row per day. */
  async usage({ from, to }: Range) {
    const params = [from, to];
    const perDay = async (sql: string) => {
      const rows = (await this.db.query(sql, params)) as { day: string; count: number; volume?: string }[];
      return rows;
    };
    const byDay = (table: string, column = '"createdAt"', where = '') =>
      perDay(
        `SELECT to_char(date_trunc('day', ${column}), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
         FROM ${table} WHERE ${column} BETWEEN $1 AND $2 ${where} GROUP BY 1 ORDER BY 1`,
      );

    const [newUsers, messages, calls, payments, statuses, reports] = await Promise.all([
      byDay('users', '"createdAt"', `AND role = 'user'`),
      byDay('messages', '"createdAt"', `AND type NOT IN ('system', 'call')`),
      byDay('calls'),
      perDay(
        `SELECT to_char(date_trunc('day', "completedAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::text AS volume
         FROM wallet_transactions WHERE type = 'transfer' AND status = 'success' AND "completedAt" BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`,
      ),
      byDay('statuses'),
      byDay('reports'),
    ]);

    const days = new Map<string, Record<string, number | string>>();
    const put = (rows: { day: string; count: number }[], key: string) => {
      for (const row of rows) {
        const entry = days.get(row.day) ?? { day: row.day, newUsers: 0, messages: 0, calls: 0, payments: 0, paymentVolumeKobo: 0, statuses: 0, reports: 0 };
        entry[key] = row.count;
        days.set(row.day, entry);
      }
    };
    put(newUsers, 'newUsers');
    put(messages, 'messages');
    put(calls, 'calls');
    put(payments, 'payments');
    put(statuses, 'statuses');
    put(reports, 'reports');
    for (const row of payments) days.get(row.day)!.paymentVolumeKobo = Number(row.volume);

    const sum = (rows: { count: number }[]) => rows.reduce((t, r) => t + r.count, 0);
    return {
      from,
      to,
      totals: {
        newUsers: sum(newUsers),
        messages: sum(messages),
        calls: sum(calls),
        payments: sum(payments),
        paymentVolumeKobo: payments.reduce((t, r) => t + Number(r.volume), 0),
        statusesPosted: sum(statuses),
        reportsFiled: sum(reports),
      },
      byDay: [...days.values()].sort((a, b) => String(a.day).localeCompare(String(b.day))),
    };
  }

  // ---- Dashboards ----

  private async mine(actor: AuthUser) {
    const from = new Date(Date.now() - 30 * DAY);
    const rows = await this.audit.between(from, new Date(), [actor.id]);
    const byAction: Counted = {};
    for (const row of rows) byAction[row.action] = (byAction[row.action] ?? 0) + 1;
    return { since: from, total: rows.length, byAction, lastActionAt: rows.length ? rows[rows.length - 1].createdAt : null };
  }

  /** A manager's front page: the work waiting for them. Nothing about money. */
  async managerDashboard(actor: AuthUser) {
    const [people, queue, decided, flagged, myActivity] = await Promise.all([
      this.one<{ total: number; newLast7Days: number; activeLast24h: number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE "createdAt" >= now() - interval '7 days')::int AS "newLast7Days",
                COUNT(*) FILTER (WHERE "lastSeenAt" >= now() - interval '24 hours')::int AS "activeLast24h"
         FROM users WHERE role = 'user' AND "deletedAt" IS NULL`,
      ),
      this.one<{ open: number; awaitingDecision: number; oldestOpenHours: number | null }>(
        `SELECT COUNT(*) FILTER (WHERE status = 'open')::int AS open,
                COUNT(*) FILTER (WHERE status = 'reviewed')::int AS "awaitingDecision",
                ROUND(EXTRACT(EPOCH FROM (now() - MIN("createdAt") FILTER (WHERE status IN ('open', 'reviewed')))) / 3600)::int AS "oldestOpenHours"
         FROM reports`,
      ),
      this.grouped(
        `SELECT decision AS key, COUNT(*)::int AS count FROM reports
         WHERE "decidedAt" >= now() - interval '30 days' GROUP BY decision`,
      ),
      this.db.query(
        `SELECT r."accusedId" AS id, u.username, COUNT(*)::int AS reports
         FROM reports r JOIN users u ON u.id = r."accusedId"
         WHERE r."createdAt" >= now() - interval '30 days' GROUP BY r."accusedId", u.username
         HAVING COUNT(*) >= 3 ORDER BY reports DESC LIMIT 5`,
      ),
      this.mine(actor),
    ]);
    return { people, moderation: { ...queue, decidedLast30Days: decided, peopleReportedOften: flagged }, myActivity };
  }

  /** Adds messaging, calls and money, which only admins and above see. */
  async adminDashboard(actor: AuthUser) {
    const [base, messaging, byType, calls, accounts, deactivated, deleted, audit, money] = await Promise.all([
      this.managerDashboard(actor),
      this.one<{ today: number; last7Days: number; sendersLast24h: number; directChats: number; groupChats: number; activeStatuses: number }>(
        `SELECT (SELECT COUNT(*)::int FROM messages WHERE "createdAt" >= date_trunc('day', now()) AND type NOT IN ('system', 'call')) AS today,
                (SELECT COUNT(*)::int FROM messages WHERE "createdAt" >= now() - interval '7 days' AND type NOT IN ('system', 'call')) AS "last7Days",
                (SELECT COUNT(DISTINCT "senderId")::int FROM messages WHERE "createdAt" >= now() - interval '24 hours' AND "senderId" IS NOT NULL) AS "sendersLast24h",
                (SELECT COUNT(*)::int FROM conversations WHERE type = 'direct') AS "directChats",
                (SELECT COUNT(*)::int FROM conversations WHERE type = 'group') AS "groupChats",
                (SELECT COUNT(*)::int FROM statuses WHERE "deletedAt" IS NULL AND "expiresAt" > now()) AS "activeStatuses"`,
      ),
      this.grouped(
        `SELECT type AS key, COUNT(*)::int AS count FROM messages WHERE "createdAt" >= now() - interval '7 days' GROUP BY type`,
      ),
      this.grouped(
        `SELECT status AS key, COUNT(*)::int AS count FROM calls WHERE "createdAt" >= now() - interval '7 days' GROUP BY status`,
      ),
      this.grouped(`SELECT role AS key, COUNT(*)::int AS count FROM users WHERE "deletedAt" IS NULL GROUP BY role`),
      this.users.count({ where: { isActive: false, deletedAt: IsNull() } }),
      this.one<{ total: number }>(`SELECT COUNT(*)::int AS total FROM users WHERE "deletedAt" IS NOT NULL`).then((r) => r.total),
      this.audit.countsByAction(new Date(Date.now() - 30 * DAY)),
      this.one<{
        inWallets: string;
        frozenWallets: number;
        funded30d: string;
        sentCount30d: number;
        sentVolume30d: string;
        pendingTopUps: number;
      }>(
        `SELECT (SELECT COALESCE(SUM(balance), 0) FROM wallets)::text AS "inWallets",
                (SELECT COUNT(*)::int FROM wallets WHERE "frozenAt" IS NOT NULL) AS "frozenWallets",
                (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE type = 'funding' AND status = 'success' AND "completedAt" >= now() - interval '30 days')::text AS funded30d,
                (SELECT COUNT(*)::int FROM wallet_transactions WHERE type = 'transfer' AND status = 'success' AND "completedAt" >= now() - interval '30 days') AS "sentCount30d",
                (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE type = 'transfer' AND status = 'success' AND "completedAt" >= now() - interval '30 days')::text AS "sentVolume30d",
                (SELECT COUNT(*)::int FROM wallet_transactions WHERE type = 'funding' AND status = 'pending' AND "createdAt" >= now() - interval '1 day') AS "pendingTopUps"`,
      ),
    ]);
    return {
      ...base,
      messaging: { ...messaging, last7DaysByType: byType },
      calls: { last7DaysByStatus: calls },
      accounts: { byRole: accounts, deactivated, deleted },
      moderationLast30Days: {
        messagesAndStatusesRemoved: audit['chat.remove_message'] ?? 0,
        usersDeactivated: audit['user.deactivate'] ?? 0,
        usersDeleted: audit['user.delete'] ?? 0,
        reportsDecided: audit['report.decide'] ?? 0,
      },
      money: {
        currency: 'NGN',
        inWalletsKobo: Number(money.inWallets),
        frozenWallets: money.frozenWallets,
        toppedUpLast30DaysKobo: Number(money.funded30d),
        paymentsLast30Days: money.sentCount30d,
        paymentVolumeLast30DaysKobo: Number(money.sentVolume30d),
        pendingTopUps: money.pendingTopUps,
      },
    };
  }

  /** Read-only oversight: everything above, plus who has no second factor and what staff did lately. */
  async superadminDashboard(actor: AuthUser) {
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
      this.audit.countsByAction(new Date(Date.now() - 7 * DAY)),
    ]);
    return { ...base, staffWithoutTwoFactor, activity: { last7DaysByAction: last7Days, recent } };
  }
}
