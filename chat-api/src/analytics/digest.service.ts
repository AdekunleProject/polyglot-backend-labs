import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/enums/role.enum';
import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { AnalyticsService } from './analytics.service';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Weekly summary for the superadmins by email. Off unless WEEKLY_DIGEST=true.
 * Checks hourly; sends on DIGEST_DAY after DIGEST_HOUR (local), once a week,
 * decided by the audit log so a restart does not repeat it.
 */
@Injectable()
export class DigestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DigestService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
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

  async send(actorId: number | null) {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * DAY);
    const superadmins = await this.users.find({
      where: { role: Role.SUPERADMIN, isActive: true, deletedAt: IsNull() },
    });
    const first = superadmins[0];
    if (!first) return { sent: 0, recipients: 0 };

    const asSuper = { id: first.id, email: first.email, role: Role.SUPERADMIN };
    const [usage, staff] = await Promise.all([
      this.analytics.usage({ from, to }),
      this.analytics.staffActivity(asSuper, { from, to }, false),
    ]);
    const flagged = staff.staff.filter((p) => p.flags.length > 0);
    const naira = (kobo: number) => `NGN ${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    const body = [
      `Weekly summary, ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
      '',
      `New people: ${usage.totals.newUsers}`,
      `Messages: ${usage.totals.messages}`,
      `Calls: ${usage.totals.calls}`,
      `Statuses posted: ${usage.totals.statusesPosted}`,
      `Payments: ${usage.totals.payments} (${naira(usage.totals.paymentVolumeKobo)})`,
      `Reports filed: ${usage.totals.reportsFiled}`,
      '',
      'Team activity:',
      ...staff.staff.map((p) => `- ${p.name} (${p.role}): ${p.totalActions} actions`),
      '',
      flagged.length ? 'Worth a look:' : 'Nothing flagged this week.',
      ...flagged.map((p) => `- ${p.name}: ${p.flags.join(', ')}`),
    ].join('\n');

    let sent = 0;
    for (const person of superadmins) {
      if (await this.mail.sendEmail(person.email, 'Your weekly chat summary', body)) sent += 1;
    }
    await this.audit.record(actorId, 'digest.sent', null, { recipients: superadmins.length, sent });
    return { sent, recipients: superadmins.length };
  }
}
