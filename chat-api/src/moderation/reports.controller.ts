import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { perMinute } from '../auth/throttle';
import { Role } from '../common/enums/role.enum';
import { CreateReportDto, DecideReportDto, ListReportsQueryDto, VerifyReportDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // Anyone signed in can report.
  @Post()
  @Throttle(perMinute(10))
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.reports.create(user.id, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.reports.mine(user.id);
  }

  // Staff. A superadmin can read but not act.
  @Get()
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  list(@Query() query: ListReportsQueryDto) {
    return this.reports.list(query);
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.reports.get(user, id);
  }

  @Patch(':id/verify')
  @Roles(Role.MANAGER, Role.ADMIN)
  verify(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: VerifyReportDto) {
    return this.reports.verify(user, id, dto.valid, dto.note);
  }

  @Patch(':id/decide')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  decide(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DecideReportDto) {
    return this.reports.decide(user, id, dto);
  }
}
