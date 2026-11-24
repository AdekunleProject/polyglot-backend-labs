import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import {
  AddMembersDto,
  CreateDirectDto,
  CreateGroupDto,
  EditMessageDto,
  MessagesQueryDto,
  PeopleQueryDto,
  ReadDto,
  SendMessageBodyDto,
  SetRoleDto,
  UpdateGroupDto,
} from './dto/chat.dto';
import { MessagesService } from './messages.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @Get('people')
  async people(@CurrentUser() user: AuthUser, @Query() query: PeopleQueryDto) {
    const term = query.q.trim().toLowerCase().replace(/[%_\\]/g, '\\$&');
    return this.db.query(
      `SELECT id, username, firstname, lastname FROM users
       WHERE "isActive" = true AND "deletedAt" IS NULL AND id <> $1
         AND (username LIKE $2 OR LOWER(firstname || ' ' || lastname) LIKE $3)
       ORDER BY username LIMIT 20`,
      [user.id, `${term}%`, `%${term}%`],
    );
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthUser) {
    return this.conversations.list(user.id);
  }

  @Post('conversations/direct')
  @HttpCode(200)
  direct(@CurrentUser() user: AuthUser, @Body() dto: CreateDirectDto) {
    return this.conversations.createDirect(user.id, dto.userId);
  }

  @Post('conversations/group')
  group(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.conversations.createGroup(user.id, dto.title, dto.memberIds);
  }

  @Get('conversations/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.get(user.id, id);
  }

  @Patch('conversations/:id')
  rename(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateGroupDto) {
    return this.conversations.rename(user.id, id, dto.title);
  }

  @Post('conversations/:id/members')
  @HttpCode(200)
  add(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddMembersDto) {
    return this.conversations.addMembers(user.id, id, dto.userIds);
  }

  @Delete('conversations/:id/members/:userId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.conversations.removeMember(user.id, id, userId);
  }

  @Patch('conversations/:id/members/:userId/role')
  role(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: SetRoleDto,
  ) {
    return this.conversations.setRole(user.id, id, userId, dto.role);
  }

  @Post('conversations/:id/leave')
  @HttpCode(200)
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.leave(user.id, id);
  }

  @Get('conversations/:id/messages')
  history(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: MessagesQueryDto) {
    return this.messages.history(user.id, id, query.cursor, query.limit);
  }

  @Post('conversations/:id/messages')
  send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SendMessageBodyDto) {
    return this.messages.send(user.id, { ...dto, conversationId: id });
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReadDto) {
    return this.messages.markRead(user.id, id, dto.upToId);
  }

  @Patch('messages/:id')
  edit(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: EditMessageDto) {
    return this.messages.edit(user.id, id, dto.body);
  }

  @Delete('messages/:id')
  deleteMessage(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.messages.remove(user.id, id);
  }
}
