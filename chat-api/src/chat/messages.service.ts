import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PushService } from '../devices/push.service';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { ConversationsService } from './conversations.service';
import { previewOf } from './direct-key';
import { RealtimeService } from './realtime.service';
import type { SendMessageDto } from './dto/chat.dto';

type Status = 'sent' | 'delivered' | 'read';

interface MessageRow {
  id: number;
  conversationId: string;
  senderId: number | null;
  type: string;
  body: string | null;
  replyToId: number | null;
  media: unknown;
  clientId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
}

export function present(row: MessageRow, status?: Status) {
  const deleted = !!row.deletedAt;
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    type: row.type,
    body: deleted ? null : row.body,
    replyToId: row.replyToId,
    media: deleted ? null : row.media,
    clientId: row.clientId,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    deleted,
    ...(status ? { status } : {}),
  };
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly conversations: ConversationsService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  private get editWindowMs() {
    const minutes = Number(this.config.get('MESSAGE_EDIT_MINUTES'));
    return (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60_000;
  }

  /** "Read" and "delivered" mean every other member, so a group tick is honest. */
  private async statusOf(conversationId: string, senderId: number, messageId: number): Promise<Status> {
    const rows = (await this.db.query(
      `SELECT MIN("lastReadMessageId") AS r, MIN("lastDeliveredMessageId") AS d
       FROM conversation_members
       WHERE "conversationId" = $1 AND "userId" <> $2 AND "leftAt" IS NULL`,
      [conversationId, senderId],
    )) as { r: number | null; d: number | null }[];
    const { r, d } = rows[0] ?? {};
    if (r !== null && r !== undefined && r >= messageId) return 'read';
    if (d !== null && d !== undefined && d >= messageId) return 'delivered';
    return 'sent';
  }

  // ---- Send ----

  async send(me: number, dto: SendMessageDto) {
    await this.conversations.requireMember(dto.conversationId, me);
    const type = dto.type ?? 'text';
    const body = dto.body?.trim();
    if (type !== 'text') {
      throw new BadRequestException('Voice, image and file messages are sent with an upload');
    }
    if (!body) throw new BadRequestException('A message cannot be empty');

    if (dto.replyToId) {
      const reply = (await this.db.query(
        `SELECT 1 FROM messages WHERE id = $1 AND "conversationId" = $2`,
        [dto.replyToId, dto.conversationId],
      )) as unknown[];
      if (reply.length === 0) throw new BadRequestException('The message you reply to is not in this chat');
    }

    const inserted = (await this.db.query(
      `INSERT INTO messages ("conversationId", "senderId", type, body, "replyToId", "clientId")
       VALUES ($1, $2, 'text', $3, $4, $5)
       ON CONFLICT ("senderId", "clientId") WHERE "clientId" IS NOT NULL DO NOTHING
       RETURNING *`,
      [dto.conversationId, me, body, dto.replyToId ?? null, dto.clientId],
    )) as MessageRow[];

    if (inserted.length === 0) {
      // A retry of a message we already have: hand back the original, send nothing twice.
      const existing = (await this.db.query(
        `SELECT * FROM messages WHERE "senderId" = $1 AND "clientId" = $2`,
        [me, dto.clientId],
      )) as MessageRow[];
      if (existing[0].conversationId !== dto.conversationId) {
        throw new BadRequestException('That clientId was already used');
      }
      return { ...present(existing[0], await this.statusOf(dto.conversationId, me, existing[0].id)), duplicate: true };
    }

    const row = inserted[0];
    await this.db.query(
      `UPDATE conversations SET "lastMessageId" = $2, "lastMessageAt" = $3 WHERE id = $1`,
      [row.conversationId, row.id, row.createdAt],
    );
    await this.db.query(
      `UPDATE conversation_members
       SET "lastReadMessageId" = GREATEST("lastReadMessageId", $3),
           "lastDeliveredMessageId" = GREATEST("lastDeliveredMessageId", $3)
       WHERE "conversationId" = $1 AND "userId" = $2`,
      [row.conversationId, me, row.id],
    );

    const message = present(row, 'sent');
    const memberIds = await this.conversations.memberIds(row.conversationId);
    this.realtime.emitToUsers(memberIds, 'message:new', message);
    void this.notifyOffline(me, row, memberIds);
    return message;
  }

  /** A phone notification for members with no live connection, unless muted. */
  private async notifyOffline(senderId: number, row: MessageRow, memberIds: number[]) {
    try {
      const sender = (await this.db.query(`SELECT firstname FROM users WHERE id = $1`, [senderId])) as {
        firstname: string;
      }[];
      const convo = (await this.db.query(`SELECT type, title FROM conversations WHERE id = $1`, [
        row.conversationId,
      ])) as { type: string; title: string | null }[];
      const muted = (await this.db.query(
        `SELECT "userId" FROM conversation_members
         WHERE "conversationId" = $1 AND "mutedUntil" > now()`,
        [row.conversationId],
      )) as { userId: number }[];
      const mutedIds = new Set(muted.map((m) => m.userId));
      const name = sender[0]?.firstname ?? 'New message';
      const title = convo[0]?.type === 'group' ? `${convo[0].title} · ${name}` : name;
      for (const userId of memberIds) {
        if (userId === senderId || mutedIds.has(userId)) continue;
        if (await this.realtime.isOnline(userId)) continue;
        await this.push.send(userId, title, previewOf({ type: row.type, body: row.body }), {
          conversationId: row.conversationId,
          messageId: row.id,
        });
      }
    } catch {
      // A push problem must never fail a send.
    }
  }

  // ---- History ----

  async history(me: number, conversationId: string, cursor: string | undefined, limit: number) {
    const mine = await this.conversations.requireMember(conversationId, me);
    let before: number | null = null;
    if (cursor) {
      before = decodeCursor(cursor);
      if (before === null) throw new BadRequestException('Invalid cursor');
    }
    const rows = (await this.db.query(
      `SELECT * FROM messages
       WHERE "conversationId" = $1 AND ($2::int IS NULL OR id < $2)
         AND "createdAt" >= $3
       ORDER BY id DESC LIMIT $4`,
      [conversationId, before, mine.joinedAt, limit + 1],
    )) as MessageRow[];
    const page = rows.slice(0, limit);

    const others = (await this.db.query(
      `SELECT MIN("lastReadMessageId") AS r, MIN("lastDeliveredMessageId") AS d
       FROM conversation_members
       WHERE "conversationId" = $1 AND "userId" <> $2 AND "leftAt" IS NULL`,
      [conversationId, me],
    )) as { r: number | null; d: number | null }[];
    const read = others[0]?.r ?? 0;
    const delivered = others[0]?.d ?? 0;

    return {
      items: page.map((row) =>
        present(
          row,
          row.senderId === me
            ? row.id <= read
              ? 'read'
              : row.id <= delivered
                ? 'delivered'
                : 'sent'
            : undefined,
        ),
      ),
      nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1].id) : null,
    };
  }

  // ---- Edit and delete ----

  private async ownMessage(me: number, messageId: number) {
    const rows = (await this.db.query(`SELECT * FROM messages WHERE id = $1`, [messageId])) as MessageRow[];
    const row = rows[0];
    if (!row) throw new NotFoundException('Message not found');
    // Strangers learn nothing: a message in a chat they are not in does not exist.
    await this.conversations.requireMember(row.conversationId, me);
    if (row.senderId !== me) throw new ForbiddenException('You can only change your own messages');
    if (row.deletedAt) throw new BadRequestException('That message was deleted');
    return row;
  }

  async edit(me: number, messageId: number, body: string) {
    const row = await this.ownMessage(me, messageId);
    if (row.type !== 'text') throw new BadRequestException('Only text messages can be edited');
    if (Date.now() - new Date(row.createdAt).getTime() > this.editWindowMs) {
      throw new BadRequestException('It is too late to edit this message');
    }
    const updated = (await this.db.query(
      `UPDATE messages SET body = $2, "editedAt" = now() WHERE id = $1 RETURNING *`,
      [messageId, body.trim()],
    )) as MessageRow[];
    const message = present(updated[0]);
    this.realtime.emitToUsers(await this.conversations.memberIds(row.conversationId), 'message:updated', message);
    return message;
  }

  async remove(me: number, messageId: number) {
    const row = await this.ownMessage(me, messageId);
    await this.db.query(`UPDATE messages SET "deletedAt" = now(), body = NULL, media = NULL WHERE id = $1`, [
      messageId,
    ]);
    this.realtime.emitToUsers(await this.conversations.memberIds(row.conversationId), 'message:deleted', {
      id: messageId,
      conversationId: row.conversationId,
    });
    return { message: 'Message deleted' };
  }

  // ---- Receipts ----

  async markRead(me: number, conversationId: string, upToId: number) {
    await this.conversations.requireMember(conversationId, me);
    const updated = (await this.db.query(
      `UPDATE conversation_members m
       SET "lastReadMessageId" = GREATEST(m."lastReadMessageId", LEAST($3::int, COALESCE(c."lastMessageId", 0))),
           "lastDeliveredMessageId" = GREATEST(m."lastDeliveredMessageId", LEAST($3::int, COALESCE(c."lastMessageId", 0)))
       FROM conversations c
       WHERE c.id = m."conversationId" AND m."conversationId" = $1 AND m."userId" = $2
       RETURNING m."lastReadMessageId" AS "upToId"`,
      [conversationId, me, upToId],
    )) as { upToId: number }[];
    const upTo = updated[0]?.upToId ?? 0;
    this.realtime.emitToUsers(await this.conversations.memberIds(conversationId), 'receipt', {
      conversationId,
      userId: me,
      kind: 'read',
      upToId: upTo,
    });
    return { upToId: upTo };
  }

  async markDelivered(me: number, conversationId: string, upToId: number) {
    await this.conversations.requireMember(conversationId, me);
    const updated = (await this.db.query(
      `UPDATE conversation_members m
       SET "lastDeliveredMessageId" = GREATEST(m."lastDeliveredMessageId", LEAST($3::int, COALESCE(c."lastMessageId", 0)))
       FROM conversations c
       WHERE c.id = m."conversationId" AND m."conversationId" = $1 AND m."userId" = $2
       RETURNING m."lastDeliveredMessageId" AS "upToId"`,
      [conversationId, me, upToId],
    )) as { upToId: number }[];
    const upTo = updated[0]?.upToId ?? 0;
    this.realtime.emitToUsers(await this.conversations.memberIds(conversationId), 'receipt', {
      conversationId,
      userId: me,
      kind: 'delivered',
      upToId: upTo,
    });
    return { upToId: upTo };
  }

  /** The phone just connected: everything waiting for it counts as delivered. */
  async markAllDelivered(me: number) {
    const rows = (await this.db.query(
      `UPDATE conversation_members m
       SET "lastDeliveredMessageId" = c."lastMessageId"
       FROM conversations c
       WHERE c.id = m."conversationId" AND m."userId" = $1 AND m."leftAt" IS NULL
         AND c."lastMessageId" IS NOT NULL AND m."lastDeliveredMessageId" < c."lastMessageId"
       RETURNING m."conversationId", m."lastDeliveredMessageId" AS "upToId"`,
      [me],
    )) as { conversationId: string; upToId: number }[];
    for (const row of rows) {
      this.realtime.emitToUsers(await this.conversations.memberIds(row.conversationId), 'receipt', {
        conversationId: row.conversationId,
        userId: me,
        kind: 'delivered',
        upToId: row.upToId,
      });
    }
  }
}
