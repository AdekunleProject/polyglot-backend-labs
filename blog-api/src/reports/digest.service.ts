import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/enums/role.enum';
import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { ReportsService } from './reports.service';

const DAY = 24 * 60 * 60 * 1000;

/**
 * A weekly summary for the superadmins, by email. Off unless WEEKLY_DIGEST=true.
 * It checks once an hour and sends on DIGEST_DAY (0 = Sunday, 1 = Monday...)
 * after DIGEST_HOUR, local time (REPORT_TZ_OFFSET_HOURS), once per week.
 * "Once" is decided by the audit log, so a restart does not send it again.
 */
@Injectable()
export class DigestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DigestService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly reports: ReportsService,
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
      this.logger.error(
        'Weekly digest failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Builds last week's summary and emails it to every active superadmin. */
  async send(actorId: number | null) {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * DAY);
    const superadmins = await this.users.find({
      where: { role: Role.SUPERADMIN, isActive: true, deletedAt: IsNull() },
    });
    const everyone = superadmins[0];
    if (!everyone) return { sent: 0 };

    const asSuper = { id: everyone.id, email: everyone.email, role: Role.SUPERADMIN };
    const [content, staff] = await Promise.all([
      this.reports.content({ from, to }),
      this.reports.staffActivity(asSuper, { from, to }, false),
    ]);
    const flagged = staff.staff.filter((person) => person.flags.length > 0);
    const lines = [
      `Weekly summary, ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
      '',
      `Posts created: ${content.totals.postsCreated} (published ${content.totals.postsPublished})`,
      `Comments: ${content.totals.commentsCreated}`,
      `New readers: ${content.totals.newUsers}`,
      `Posts removed by staff: ${content.moderationSince.postsRemoved}`,
      `Comments removed by staff: ${content.moderationSince.commentsRemoved}`,
      `Accounts deactivated: ${content.moderationSince.usersDeactivated}, deleted: ${content.moderationSince.usersDeleted}`,
      '',
      'Team activity:',
      ...staff.staff.map(
        (person) => `- ${person.name} (${person.role}): ${person.totalActions} actions`,
      ),
      '',
      flagged.length ? 'Worth a look:' : 'Nothing flagged this week.',
      ...flagged.map((person) => `- ${person.name}: ${person.flags.join(', ')}`),
    ].join('\n');

    let sent = 0;
    for (const person of superadmins) {
      if (await this.mail.sendEmail(person.email, 'Your weekly blog summary', lines)) sent += 1;
    }
    await this.audit.record(actorId, 'digest.sent', null, { recipients: superadmins.length, sent });
    return { sent, recipients: superadmins.length };
  }
}
