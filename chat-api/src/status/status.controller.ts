import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  ParseIntPipe,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { perMinute } from '../auth/throttle';
import { CreateStatusDto, StatusReplyDto } from './dto/status.dto';
import { StatusService } from './status.service';

@Controller('status')
@UseGuards(JwtAuthGuard)
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Post()
  @Throttle(perMinute(20))
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStatusDto) {
    return this.status.create(user.id, dto);
  }

  @Get('feed')
  feed(@CurrentUser() user: AuthUser) {
    return this.status.feed(user.id);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.status.mine(user.id);
  }

  @Post(':id/view')
  @HttpCode(200)
  view(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.status.view(user.id, id);
  }

  @Get(':id/viewers')
  viewers(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.status.viewers(user.id, id);
  }

  @Post(':id/reply')
  @Throttle(perMinute(30))
  reply(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: StatusReplyDto) {
    return this.status.reply(user.id, id, dto.clientId, dto.body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.status.remove(user.id, id);
  }
}
