import {
  Controller,
  Get,
  UseGuards,
  Post,
  Put,
  Body,
  Delete,
  Req,
  Res,
  Param,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Patch,
  Query,
  Header,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorators';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { toCsv } from './csv';
import { DigestService } from './digest.service';
import { RangeQueryDto } from './dto/range-query.dto';

import type { CurrentUserInterface } from '../common/interfaces/current-user.interface';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly digest: DigestService,
  ) {}

  /** What the team did. Superadmin sees admins and managers, an admin sees managers, a manager sees only themselves. */
  @Get('staff-activity')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  async staffActivity(
    @Query() query: RangeQueryDto,
    @CurrentUser() user: CurrentUserInterface,
    @Res({ passthrough: true }) res: Response,
  ) {
    const report = await this.analyticsService.staffActivity(user, this.analyticsService.range(query.from, query.to));
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

  @Get('sales')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async sales(@Query() query: RangeQueryDto, @Res({ passthrough: true }) res: Response) {
    const report = await this.analyticsService.sales(this.analyticsService.range(query.from, query.to));
    if (query.format !== 'csv') return report;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sales.csv"');
    return toCsv(['day', 'orders', 'payments', 'revenue'], report.byDay);
  }

  /** Sends the weekly summary to the superadmins now. The same one the schedule sends. */
  @Post('digest/send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  @Header('Cache-Control', 'no-store')
  sendDigest(@CurrentUser() user: CurrentUserInterface) {
    return this.digest.send(user.id);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async getAdminDashboard(@CurrentUser() user: CurrentUserInterface) {
    return this.analyticsService.getAdminDashboard(user.id);
  }

  @Get('manager')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  getManagerDashboard(@CurrentUser() user: CurrentUserInterface) {
    return this.analyticsService.getManagerDashboard(user);
  }

  @Get('superadmin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN)
  getSuperadminDashboard() {
    return this.analyticsService.getSuperadminDashboard();
  }

  @Get('customers/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  getCustomerDashboardForStaff(
    @CurrentUser() user: CurrentUserInterface,
    @Param('userId') userId: string,
  ) {
    return this.analyticsService.getCustomerDashboardFor(user, userId);
  }

  @Get('customer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  async getCustomerDashboard(@CurrentUser() user: CurrentUserInterface) {
    return this.analyticsService.getCustomerDashboard(user.id);
  }

  @Get('orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  getOrdersDashboard(@CurrentUser() user: CurrentUserInterface) {
    return this.analyticsService.getOrdersDashboard(user);
  }

  // BUG FIX: this and getProductListDashboard() below were both mapped to
  // the identical route @Get('products') — only whichever handler NestJS
  // registers first actually responds to a request; the other is silently
  // unreachable. Split into two distinct paths instead. `/products` stays
  // as-is (the lighter category/brand/product/variant counts, useful on
  // an "Add Product" screen) and the richer inventory breakdown moves to
  // `/products/inventory`.
  @Get('products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  getAddProductDashboard() {
    return this.analyticsService.getAddProductDashboard();
  }

  @Get('products/inventory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  getProductListDashboard() {
    return this.analyticsService.getProductListDashboard();
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  getTransactionsDashboard() {
    return this.analyticsService.getTransactionsDashboard();
  }
}
