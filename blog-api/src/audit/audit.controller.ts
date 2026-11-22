import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Role } from '../common/enums/role.enum';
import { ListUsersQueryDto } from '../users/dto/list-users-query.dto';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles(Role.SUPERADMIN)
  list(@Query() query: ListUsersQueryDto) {
    return this.audit.list(query.page, query.limit);
  }
}
