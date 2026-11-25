import { Controller, Get, Header, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Role } from '../common/enums/role.enum';
import { AnalyticsService } from './analytics.service';
import { toCsv } from './csv';
import { DigestService } from './digest.service';
import { RangeQueryDto } from './dto/range-query.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly digest: DigestService,
  ) {}

  @Get('dashboard/manager')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  manager(@CurrentUser() actor: AuthUser) {
    return this.analytics.managerDashboard(actor);
  }

  @Get('dashboard/admin')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  admin(@CurrentUser() actor: AuthUser) {
    return this.analytics.adminDashboard(actor);
  }

  @Get('dashboard/superadmin')
  @Roles(Role.SUPERADMIN)
  superadmin(@CurrentUser() actor: AuthUser) {
    return this.analytics.superadminDashboard(actor);
  }

  @Get('analytics/staff-activity')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  async staffActivity(
    @Query() query: RangeQueryDto,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const report = await this.analytics.staffActivity(actor, this.analytics.range(query.from, query.to));
    if (query.format !== 'csv') return report;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="staff-activity.csv"');
    return toCsv(
      ['id', 'name', 'email', 'role', 'isActive', 'twoFactorEnabled', 'totalActions', 'lastActionAt', 'deletes', 'lookups', 'offHoursActions', 'flags', 'actions'],
      report.staff.map((row) => ({
        ...row,
        flags: row.flags.join('; '),
        actions: Object.entries(row.actions).map(([a, c]) => `${a}:${c}`).join('; '),
      })),
    );
  }

  @Get('analytics/usage')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async usage(@Query() query: RangeQueryDto, @Res({ passthrough: true }) res: Response) {
    const report = await this.analytics.usage(this.analytics.range(query.from, query.to));
    if (query.format !== 'csv') return report;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="usage.csv"');
    return toCsv(
      ['day', 'newUsers', 'messages', 'calls', 'payments', 'paymentVolumeKobo', 'statuses', 'reports'],
      report.byDay,
    );
  }

  @Post('analytics/digest/send')
  @Roles(Role.SUPERADMIN)
  @Header('Cache-Control', 'no-store')
  sendDigest(@CurrentUser() actor: AuthUser) {
    return this.digest.send(actor.id);
  }
}
