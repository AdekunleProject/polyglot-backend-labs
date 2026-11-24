import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { perMinute } from '../auth/throttle';
import { CallsService } from './calls.service';
import { CallsQueryDto, StartCallDto } from './dto/calls.dto';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post()
  @Throttle(perMinute(20))
  start(@CurrentUser() user: AuthUser, @Body() dto: StartCallDto) {
    return this.calls.start(user.id, dto.conversationId, dto.type);
  }

  @Get()
  history(@CurrentUser() user: AuthUser, @Query() query: CallsQueryDto) {
    return this.calls.history(user.id, query.cursor, query.limit);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.calls.get(user.id, id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.calls.accept(user.id, id);
  }

  @Post(':id/decline')
  @HttpCode(200)
  decline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.calls.decline(user.id, id);
  }

  @Post(':id/leave')
  @HttpCode(200)
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.calls.leave(user.id, id);
  }

  @Post(':id/end')
  @HttpCode(200)
  end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.calls.end(user.id, id);
  }
}
