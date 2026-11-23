import { Controller, Get, Header, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Role } from '../common/enums/role.enum';
import { toCsv } from './csv';
import { DigestService } from './digest.service';
import { RangeQueryDto } from './dto/range-query.dto';
import { ReportsService } from './reports.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly digest: DigestService,
  ) {}

  @Get('dashboard/manager')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  manager(@CurrentUser() actor: AuthUser) {
    return this.reports.managerDashboard(actor);
  }

  @Get('dashboard/admin')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  admin(@CurrentUser() actor: AuthUser) {
    return this.reports.adminDashboard(actor);
  }

  @Get('dashboard/superadmin')
  @Roles(Role.SUPERADMIN)
  superadmin(@CurrentUser() actor: AuthUser) {
    return this.reports.superadminDashboard(actor);
  }

  /**
   * What the team did. The superadmin sees admins and managers, an admin sees
   * managers, a manager sees only themselves.
   */
  @Get('reports/staff-activity')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  async staffActivity(
    @Query() query: RangeQueryDto,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const report = await this.reports.staffActivity(
      actor,
      this.reports.range(query.from, query.to),
    );
    if (query.format !== 'csv') return report;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="staff-activity.csv"');
    return toCsv(
      [
        'id', 'name', 'email', 'role', 'isActive', 'twoFactorEnabled', 'totalActions',
        'lastActionAt', 'deletes', 'lookups', 'offHoursActions', 'flags', 'actions',
      ],
      report.staff.map((row) => ({
        ...row,
        flags: row.flags.join('; '),
        actions: Object.entries(row.actions)
          .map(([action, count]) => `${action}:${count}`)
          .join('; '),
      })),
    );
  }

  @Get('reports/content')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async content(
    @Query() query: RangeQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const report = await this.reports.content(this.reports.range(query.from, query.to));
    if (query.format !== 'csv') return report;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="content.csv"');
    const days = new Map<string, { day: string; posts: number; comments: number }>();
    for (const row of report.postsByDay) days.set(row.day, { day: row.day, posts: row.count, comments: 0 });
    for (const row of report.commentsByDay) {
      const entry = days.get(row.day) ?? { day: row.day, posts: 0, comments: 0 };
      entry.comments = row.count;
      days.set(row.day, entry);
    }
    return toCsv(
      ['day', 'posts', 'comments'],
      [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    );
  }

  /** Sends the weekly summary to the superadmins now. The same one the schedule sends. */
  @Post('reports/digest/send')
  @Roles(Role.SUPERADMIN)
  @Header('Cache-Control', 'no-store')
  sendDigest(@CurrentUser() actor: AuthUser) {
    return this.digest.send(actor.id);
  }
}
