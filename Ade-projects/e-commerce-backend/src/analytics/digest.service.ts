import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/enums/role.enum';
import { MailService } from '../helpers/mail/mail-service';
import { User } from '../users/schemas/user.schema';
import { AnalyticsService } from './analytics.service';

const DAY = 24 * 60 * 60 * 1000;

/**
 * A weekly summary for the superadmins, by email. Off unless WEEKLY_DIGEST=true.
 * It checks once an hour and sends on DIGEST_DAY (0 = Sunday, 1 = Monday...)
 * after DIGEST_HOUR, local time (REPORT_TZ_OFFSET_HOURS), once per week.
 * "Once" is decided by the audit log, so a restart does not send it again.
 * With several replicas two could send in the same hour: run it on one, or
 * call POST /analytics/digest/send from a cron job instead.
 */
@Injectable()
export class DigestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DigestService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get('WEEKLY_DIGEST') !== 'true') return;
    this.timer = setInterval(() => void this.tick(), 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const offset = Number(this.config.get('REPORT_TZ_OFFSET_HOURS') ?? 1);
      const local = new Date(Date.now() + offset * 60 * 60 * 1000);
      const day = Number(this.config.get('DIGEST_DAY') ?? 1);
      const hour = Number(this.config.get('DIGEST_HOUR') ?? 8);
      if (local.getUTCDay() !== day || local.getUTCHours() < hour) return;
      const last = await this.audit.lastOf('digest.sent');
      if (last && Date.now() - last.createdAt.getTime() < 6 * DAY) return;
      await this.send(null);
    } catch (error) {
      this.logger.error('Weekly digest failed', error instanceof Error ? error.stack : String(error));
    }
  }

  /** Builds last week's summary and emails it to every active superadmin. */
  async send(actorId: string | null) {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * DAY);
    const superadmins = await this.users.find({ role: Role.SUPERADMIN, isActive: true, deletedAt: null }).lean();
    const first = superadmins[0];
    if (!first) return { sent: 0, recipients: 0 };

    const asSuper = { id: String(first._id), email: first.email, role: Role.SUPERADMIN } as Parameters<AnalyticsService['staffActivity']>[0];
    const [sales, staff] = await Promise.all([
      this.analytics.sales({ from, to }),
      this.analytics.staffActivity(asSuper, { from, to }, false),
    ]);
    const flagged = staff.staff.filter((person) => person.flags.length > 0);
    const naira = (amount: number) => `NGN ${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    const body = [
      `Weekly summary, ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
      '',
      `Orders: ${sales.totals.orders}`,
      `Paid: ${sales.totals.payments} payments, ${naira(sales.totals.revenue)}`,
      `Refunded: ${sales.totals.refunds} (${naira(sales.totals.refundedAmount)})`,
      `New customers: ${sales.totals.newCustomers}`,
      '',
      'Team activity:',
      ...staff.staff.map((p) => `- ${p.name} (${p.role}): ${p.totalActions} actions`),
      '',
      flagged.length ? 'Worth a look:' : 'Nothing flagged this week.',
      ...flagged.map((p) => `- ${p.name}: ${p.flags.join(', ')}`),
    ].join('\n');

    let sent = 0;
    for (const person of superadmins) {
      if (await this.mail.sendEmail(person.email, 'Your weekly store summary', body)) sent += 1;
    }
    await this.audit.record(actorId, 'digest.sent', undefined, { recipients: superadmins.length, sent });
    return { sent, recipients: superadmins.length };
  }
}
