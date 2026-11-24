import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, ArrayMaxSize } from 'class-validator';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CursorQueryDto } from '../notifications/dto/notifications.dto';
import { EngagementService } from './engagement.service';

class FeedQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsDateString()
  updatedSince?: string;
}

class StatesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  postIds: number[];
}

@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  // ---- Feed: public, a page at a time ----

  @Get('feed')
  feed(@Query() query: FeedQueryDto) {
    return this.engagement.feed({
      cursor: query.cursor,
      limit: query.limit,
      updatedSince: query.updatedSince ? new Date(query.updatedSince) : undefined,
    });
  }

  @Get('feed/following')
  @UseGuards(JwtAuthGuard)
  following(@CurrentUser() user: AuthUser, @Query() query: FeedQueryDto) {
    return this.engagement.feed({
      cursor: query.cursor,
      limit: query.limit,
      followedBy: user.id,
      updatedSince: query.updatedSince ? new Date(query.updatedSince) : undefined,
    });
  }

  @Get('authors/:id/posts')
  byAuthor(@Param('id', ParseIntPipe) id: number, @Query() query: CursorQueryDto) {
    return this.engagement.feed({ cursor: query.cursor, limit: query.limit, authorId: id });
  }

  /** Which posts on screen has this person liked or saved? */
  @Post('feed/states')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  states(@CurrentUser() user: AuthUser, @Body() dto: StatesDto) {
    return this.engagement.states(user.id, dto.postIds);
  }

  // ---- Likes and bookmarks ----

  @Post('posts/:id/like')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  like(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.engagement.like(user.id, id);
  }

  @Delete('posts/:id/like')
  @UseGuards(JwtAuthGuard)
  unlike(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.engagement.unlike(user.id, id);
  }

  @Post('posts/:id/bookmark')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  bookmark(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.engagement.bookmark(user.id, id);
  }

  @Delete('posts/:id/bookmark')
  @UseGuards(JwtAuthGuard)
  unbookmark(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.engagement.unbookmark(user.id, id);
  }

  @Get('bookmarks')
  @UseGuards(JwtAuthGuard)
  bookmarks(@CurrentUser() user: AuthUser, @Query() query: CursorQueryDto) {
    return this.engagement.bookmarks(user.id, query.cursor, query.limit);
  }

  // ---- Follows and profiles ----

  @Post('users/:id/follow')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  follow(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.engagement.follow(user.id, id);
  }

  @Delete('users/:id/follow')
  @UseGuards(JwtAuthGuard)
  unfollow(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.engagement.unfollow(user.id, id);
  }

  @Get('profiles/:id')
  profile(@Param('id', ParseIntPipe) id: number) {
    return this.engagement.profile(id);
  }

  @Get('profiles/:id/me')
  @UseGuards(JwtAuthGuard)
  profileAsViewer(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.engagement.profile(id, user.id);
  }
}
