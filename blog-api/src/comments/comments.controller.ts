import { OptionalReasonDto } from '../common/dto/reason.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { perMinute } from '../auth/throttle';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @UseGuards(JwtAuthGuard)
  @Throttle(perMinute(10))
  @Post('posts/:postId/comments')
  create(
    @Param('postId', ParseIntPipe) postId: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commentsService.create(postId, dto, user);
  }

  @Get('posts/:postId/comments')
  findForPost(
    @Param('postId', ParseIntPipe) postId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = Math.max(Number(page) || 1, 1);
    const l = Math.min(Math.max(Number(limit) || 10, 1), 50);
    return this.commentsService.findForPost(postId, p, l);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('comments/:id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OptionalReasonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commentsService.remove(id, user, dto.reason);
  }
}
