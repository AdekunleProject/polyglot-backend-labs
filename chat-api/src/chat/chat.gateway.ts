import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { DataSource } from 'typeorm';
import type { Server, Socket } from 'socket.io';
import { ConversationsService } from './conversations.service';
import { ReceiptDto, SendMessageDto, TypingDto } from './dto/chat.dto';
import { MessagesService } from './messages.service';
import { RealtimeService } from '../realtime/realtime.service';

interface SocketData {
  userId: number;
  sid?: string;
}

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };

@WebSocketGateway({ maxHttpBufferSize: 1e5, pingInterval: 20_000, pingTimeout: 20_000 })
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);
  @WebSocketServer() server: Server;

  constructor(
    private readonly jwt: JwtService,
    @InjectDataSource() private readonly db: DataSource,
    private readonly realtime: RealtimeService,
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
  ) {}

  afterInit(server: Server) {
    this.realtime.server = server;
    // The token is checked before the connection exists, against the database.
    server.use((socket, next) => {
      void this.authenticate(socket)
        .then((userId) => {
          (socket.data as SocketData).userId = userId;
          next();
        })
        .catch(() => next(new Error('unauthorized')));
    });
  }

  private async authenticate(socket: Socket): Promise<number> {
    const header = socket.handshake.headers.authorization;
    const token =
      (socket.handshake.auth as { token?: string })?.token ??
      (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!token) throw new Error('no token');
    const payload = await this.jwt.verifyAsync<{ sub: number; sid?: string }>(token);
    if (payload.sid) {
      const live = (await this.db.query(`SELECT 1 FROM sessions WHERE id = $1 AND "userId" = $2`, [
        payload.sid,
        payload.sub,
      ])) as unknown[];
      if (live.length === 0) throw new Error('signed out');
    }
    (socket.data as SocketData).sid = payload.sid;
    const rows = (await this.db.query(
      `SELECT "isActive", "deletedAt", "mustChangePassword" FROM users WHERE id = $1`,
      [payload.sub],
    )) as { isActive: boolean; deletedAt: Date | null; mustChangePassword: boolean }[];
    const user = rows[0];
    if (!user || !user.isActive || user.deletedAt || user.mustChangePassword) {
      throw new Error('not allowed');
    }
    return payload.sub;
  }

  private uid(socket: Socket) {
    return (socket.data as SocketData).userId;
  }

  async handleConnection(socket: Socket) {
    const me = this.uid(socket);
    const wasOnline = (await this.server.in(`user:${me}`).fetchSockets()).length > 0;
    await socket.join(`user:${me}`);
    const sid = (socket.data as SocketData).sid;
    if (sid) await socket.join(`session:${sid}`);
    await this.messages.markAllDelivered(me).catch(() => undefined);
    if (!wasOnline) await this.broadcastPresence(me, true);
  }

  async handleDisconnect(socket: Socket) {
    const me = this.uid(socket);
    if (!me) return;
    const left = (await this.server.in(`user:${me}`).fetchSockets()).length;
    if (left > 0) return;
    await this.db.query(`UPDATE users SET "lastSeenAt" = now() WHERE id = $1`, [me]);
    await this.broadcastPresence(me, false);
  }

  /** Only people who share a direct chat with you see when you come and go. */
  private async broadcastPresence(userId: number, online: boolean) {
    const rows = (await this.db.query(
      `SELECT other."userId" FROM conversation_members mine
       JOIN conversations c ON c.id = mine."conversationId" AND c.type = 'direct'
       JOIN conversation_members other ON other."conversationId" = c.id AND other."userId" <> $1
       WHERE mine."userId" = $1 AND mine."leftAt" IS NULL AND other."leftAt" IS NULL`,
      [userId],
    )) as { userId: number }[];
    this.realtime.emitToUsers(
      rows.map((r) => r.userId),
      'presence',
      { userId, online, lastSeenAt: online ? null : new Date().toISOString() },
    );
  }

  private async run<T>(work: () => Promise<T>): Promise<Ack<T>> {
    try {
      return { ok: true, data: await work() };
    } catch (error) {
      const message = (error as { message?: string }).message ?? 'Something went wrong';
      this.logger.debug(message);
      return { ok: false, error: message };
    }
  }

  @SubscribeMessage('message:send')
  send(@ConnectedSocket() socket: Socket, @MessageBody() dto: SendMessageDto) {
    return this.run(() => this.messages.send(this.uid(socket), dto));
  }

  @SubscribeMessage('message:read')
  read(@ConnectedSocket() socket: Socket, @MessageBody() dto: ReceiptDto) {
    return this.run(() => this.messages.markRead(this.uid(socket), dto.conversationId, dto.upToId));
  }

  @SubscribeMessage('message:delivered')
  delivered(@ConnectedSocket() socket: Socket, @MessageBody() dto: ReceiptDto) {
    return this.run(() => this.messages.markDelivered(this.uid(socket), dto.conversationId, dto.upToId));
  }

  @SubscribeMessage('typing')
  typing(@ConnectedSocket() socket: Socket, @MessageBody() dto: TypingDto) {
    return this.run(async () => {
      const me = this.uid(socket);
      await this.conversations.requireMember(dto.conversationId, me);
      const ids = (await this.conversations.memberIds(dto.conversationId)).filter((id) => id !== me);
      this.realtime.emitToUsers(ids, 'typing', {
        conversationId: dto.conversationId,
        userId: me,
        isTyping: dto.isTyping !== false,
      });
      return {};
    });
  }
}
