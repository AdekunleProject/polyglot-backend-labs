import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { perMinute } from '../auth/throttle';
import { BackupsService } from './backups.service';
import { CreateBackupDto } from './dto/backups.dto';

@Controller('backups')
@UseGuards(JwtAuthGuard)
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Post()
  @HttpCode(202)
  @Throttle(perMinute(3))
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBackupDto) {
    return this.backups.create(user.id, dto.password);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.backups.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.backups.get(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.backups.remove(user.id, id);
  }
}
