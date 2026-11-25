import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { IsInt } from 'class-validator';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BlocksService } from './blocks.service';

class BlockDto {
  @IsInt()
  userId: number;
}

@Controller('blocks')
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.blocks.list(user.id);
  }

  @Post()
  @HttpCode(200)
  block(@CurrentUser() user: AuthUser, @Body() dto: BlockDto) {
    return this.blocks.block(user.id, dto.userId);
  }

  @Delete(':userId')
  unblock(@CurrentUser() user: AuthUser, @Param('userId', ParseIntPipe) userId: number) {
    return this.blocks.unblock(user.id, userId);
  }
}
