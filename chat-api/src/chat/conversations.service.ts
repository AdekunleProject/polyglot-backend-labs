import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { directKey, previewOf } from './direct-key';
import type { MemberRole } from './entities/conversation-member.entity';
import { RealtimeService } from './realtime.service';

interface MemberRow {
  conversationId: string;
  userId: number;
  role: MemberRole;
  joinedAt: Date;
  lastReadMessageId: number;
}

@Injectable()
export class ConversationsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService,
  ) {}

  private get maxMembers() {
    const value = Number(this.config.get('GROUP_MAX_MEMBERS'));
    return Number.isFinite(value) && value >= 2 ? value : 256;
  }

  // ---- Access ----

  /** The caller's active membership. "Not found" for strangers, so ids reveal nothing. */
  async requireMember(conversationId: string, userId: number): Promise<MemberRow> {
    const valid = /^[0-9a-f-]{36}$/i.test(conversationId);
    const rows = valid
      ? ((await this.db.query(
          `SELECT "conversationId", "userId", role, "joinedAt", "lastReadMessageId"
           FROM conversation_members
           WHERE "conversationId" = $1 AND "userId" = $2 AND "leftAt" IS NULL`,
          [conversationId, userId],
        )) as MemberRow[])
      : [];
    if (!rows[0]) throw new NotFoundException('Conversation not found');
    return rows[0];
  }

  async memberIds(conversationId: string, manager?: EntityManager): Promise<number[]> {
    const rows = (await (manager ?? this.db).query(
      `SELECT "userId" FROM conversation_members WHERE "conversationId" = $1 AND "leftAt" IS NULL`,
      [conversationId],
    )) as { userId: number }[];
    return rows.map((row) => row.userId);
  }

  private async requireType(conversationId: string, type: 'group' | 'direct') {
    const rows = (await this.db.query(`SELECT type FROM conversations WHERE id = $1`, [
      conversationId,
    ])) as { type: string }[];
    if (rows[0]?.type !== type) {
      throw new BadRequestException(`This only works on ${type} conversations`);
    }
  }

  private async requireManager(conversationId: string, userId: number) {
    const member = await this.requireMember(conversationId, userId);
    if (member.role === 'member') {
      throw new ForbiddenException('Only a group admin can do this');
    }
    return member;
  }

  /** Everyone in `ids` must be a live account. Returns their short names. */
  private async liveUsers(ids: number[]) {
    if (ids.length === 0) return [];
    const rows = (await this.db.query(
      `SELECT id, firstname FROM users WHERE id = ANY($1) AND "isActive" = true AND "deletedAt" IS NULL`,
      [ids],
    )) as { id: number; firstname: string }[];
    if (rows.length !== new Set(ids).size) {
      throw new BadRequestException('One or more of those people do not exist');
    }
    return rows;
  }

  private async nameOf(userId: number) {
    const rows = (await this.db.query(`SELECT firstname FROM users WHERE id = $1`, [userId])) as {
      firstname: string;
    }[];
    return rows[0]?.firstname ?? 'Someone';
  }

  /** A line in the chat that nobody wrote: "Ada added Bob". */
  async postSystem(conversationId: string, text: string, manager?: EntityManager) {
    const db = manager ?? this.db;
    const rows = (await db.query(
      `INSERT INTO messages ("conversationId", type, body) VALUES ($1, 'system', $2)
       RETURNING id, "createdAt"`,
      [conversationId, text],
    )) as { id: number; createdAt: Date }[];
    const { id, createdAt } = rows[0];
    await db.query(
      `UPDATE conversations SET "lastMessageId" = $2, "lastMessageAt" = $3 WHERE id = $1`,
      [conversationId, id, createdAt],
    );
    return {
      id,
      conversationId,
      senderId: null,
      type: 'system' as const,
      body: text,
      replyToId: null,
      media: null,
      clientId: null,
      createdAt,
      editedAt: null,
      deleted: false,
    };
  }

  // ---- Create ----

  async createDirect(me: number, otherId: number) {
    if (me === otherId) throw new BadRequestException('You cannot chat with yourself');
    await this.liveUsers([otherId]).catch(() => {
      throw new NotFoundException('User not found');
    });
    const key = directKey(me, otherId);

    const find = async () =>
      ((await this.db.query(`SELECT id FROM conversations WHERE "directKey" = $1`, [key])) as {
        id: string;
      }[])[0]?.id;

    let id = await find();
    if (!id) {
      id = randomUUID();
      try {
        await this.db.transaction(async (tx) => {
          await tx.query(
            `INSERT INTO conversations (id, type, "directKey", "createdById") VALUES ($1, 'direct', $2, $3)`,
            [id, key, me],
          );
          await tx.query(
            `INSERT INTO conversation_members ("conversationId", "userId", role) VALUES ($1, $2, 'member'), ($1, $3, 'member')`,
            [id, me, otherId],
          );
        });
        this.realtime.emitToUsers([otherId], 'conversation:new', { conversationId: id });
      } catch (error) {
        // Two people started the same chat at once: the other one won.
        if ((error as { code?: string }).code !== '23505') throw error;
        id = (await find())!;
      }
    }
    return this.get(me, id);
  }

  async createGroup(me: number, title: string, memberIds: number[]) {
    const others = [...new Set(memberIds)].filter((id) => id !== me);
    if (others.length === 0) throw new BadRequestException('Add at least one other person');
    if (others.length + 1 > this.maxMembers) {
      throw new BadRequestException(`A group can have at most ${this.maxMembers} members`);
    }
    await this.liveUsers(others);

    const id = randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO conversations (id, type, title, "createdById") VALUES ($1, 'group', $2, $3)`,
        [id, title.trim(), me],
      );
      await tx.query(
        `INSERT INTO conversation_members ("conversationId", "userId", role) VALUES ($1, $2, 'owner')`,
        [id, me],
      );
      for (const userId of others) {
        await tx.query(
          `INSERT INTO conversation_members ("conversationId", "userId", role) VALUES ($1, $2, 'member')`,
          [id, userId],
        );
      }
      await this.postSystem(id, `${await this.nameOf(me)} created the group "${title.trim()}"`, tx);
    });
    this.realtime.emitToUsers(others, 'conversation:new', { conversationId: id });
    return this.get(me, id);
  }

  // ---- Read ----

  /** The chat list: newest activity first, with unread counts and the last message. */
  async list(me: number) {
    const rows = (await this.db.query(
      `SELECT c.id, c.type, c.title, c."lastMessageAt", c."createdAt",
              m.role, m."lastReadMessageId", m."mutedUntil",
              (SELECT COUNT(*)::int FROM messages x
                WHERE x."conversationId" = c.id AND x.id > m."lastReadMessageId"
                  AND x."senderId" IS DISTINCT FROM $1 AND x."deletedAt" IS NULL
                  AND x."createdAt" >= m."joinedAt") AS unread,
              lm.id AS "lmId", lm.type AS "lmType", lm.body AS "lmBody",
              lm."senderId" AS "lmSender", lm."createdAt" AS "lmAt", lm."deletedAt" AS "lmDeleted",
              CASE WHEN c.type = 'direct' THEN (
                SELECT json_build_object('id', u.id, 'username', u.username, 'firstname', u.firstname,
                                         'lastname', u.lastname, 'lastSeenAt', u."lastSeenAt")
                FROM conversation_members cm JOIN users u ON u.id = cm."userId"
                WHERE cm."conversationId" = c.id AND cm."userId" <> $1 LIMIT 1) END AS peer
       FROM conversation_members m
       JOIN conversations c ON c.id = m."conversationId"
       LEFT JOIN messages lm ON lm.id = c."lastMessageId" AND lm."createdAt" >= m."joinedAt"
       WHERE m."userId" = $1 AND m."leftAt" IS NULL
       ORDER BY COALESCE(c."lastMessageAt", c."createdAt") DESC
       LIMIT 200`,
      [me],
    )) as Record<string, any>[];

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.type === 'group' ? row.title : null,
      peer: row.peer ?? null,
      myRole: row.role,
      muted: !!row.mutedUntil && new Date(row.mutedUntil) > new Date(),
      unread: row.unread,
      lastMessage: row.lmId
        ? {
            id: row.lmId,
            type: row.lmType,
            senderId: row.lmSender,
            preview: row.lmDeleted ? 'Message deleted' : previewOf({ type: row.lmType, body: row.lmBody }),
            createdAt: row.lmAt,
          }
        : null,
      lastActivityAt: row.lastMessageAt ?? row.createdAt,
    }));
  }

  async get(me: number, conversationId: string) {
    const mine = await this.requireMember(conversationId, me);
    const [convo] = (await this.db.query(
      `SELECT id, type, title, "createdAt" FROM conversations WHERE id = $1`,
      [conversationId],
    )) as { id: string; type: string; title: string | null; createdAt: Date }[];
    const members = (await this.db.query(
      `SELECT u.id, u.username, u.firstname, u.lastname, u."lastSeenAt", m.role, m."joinedAt"
       FROM conversation_members m JOIN users u ON u.id = m."userId"
       WHERE m."conversationId" = $1 AND m."leftAt" IS NULL
       ORDER BY m."joinedAt", u.id`,
      [conversationId],
    )) as Record<string, unknown>[];
    return { ...convo, title: convo.type === 'group' ? convo.title : null, myRole: mine.role, members };
  }

  // ---- Groups ----

  async rename(me: number, conversationId: string, title: string) {
    await this.requireMember(conversationId, me);
    await this.requireType(conversationId, 'group');
    await this.requireManager(conversationId, me);
    await this.db.query(`UPDATE conversations SET title = $2 WHERE id = $1`, [conversationId, title.trim()]);
    const message = await this.postSystem(
      conversationId,
      `${await this.nameOf(me)} renamed the group to "${title.trim()}"`,
    );
    this.announce(conversationId, message);
    return this.get(me, conversationId);
  }

  async addMembers(me: number, conversationId: string, userIds: number[]) {
    await this.requireType(conversationId, 'group');
    await this.requireManager(conversationId, me);
    const wanted = [...new Set(userIds)].filter((id) => id !== me);
    const added = await this.liveUsers(wanted);

    const current = await this.memberIds(conversationId);
    const fresh = added.filter((user) => !current.includes(user.id));
    if (current.length + fresh.length > this.maxMembers) {
      throw new BadRequestException(`A group can have at most ${this.maxMembers} members`);
    }
    if (fresh.length === 0) return this.get(me, conversationId);

    await this.db.transaction(async (tx) => {
      for (const user of fresh) {
        // Someone who left and is added back starts clean: they do not see what was said while away.
        await tx.query(
          `INSERT INTO conversation_members ("conversationId", "userId", role) VALUES ($1, $2, 'member')
           ON CONFLICT ("conversationId", "userId") DO UPDATE
             SET "leftAt" = NULL, role = 'member', "joinedAt" = now(),
                 "lastReadMessageId" = 0, "lastDeliveredMessageId" = 0`,
          [conversationId, user.id],
        );
      }
    });
    const message = await this.postSystem(
      conversationId,
      `${await this.nameOf(me)} added ${fresh.map((u) => u.firstname).join(', ')}`,
    );
    this.realtime.emitToUsers(
      fresh.map((u) => u.id),
      'conversation:new',
      { conversationId },
    );
    this.announce(conversationId, message);
    return this.get(me, conversationId);
  }

  async removeMember(me: number, conversationId: string, userId: number) {
    await this.requireType(conversationId, 'group');
    const actor = await this.requireManager(conversationId, me);
    if (userId === me) throw new BadRequestException('Use "leave" to leave the group');
    const target = await this.requireMember(conversationId, userId);
    if (target.role === 'owner' || (target.role === 'admin' && actor.role !== 'owner')) {
      throw new ForbiddenException('You cannot remove this member');
    }
    await this.db.query(
      `UPDATE conversation_members SET "leftAt" = now() WHERE "conversationId" = $1 AND "userId" = $2`,
      [conversationId, userId],
    );
    const message = await this.postSystem(
      conversationId,
      `${await this.nameOf(me)} removed ${await this.nameOf(userId)}`,
    );
    this.realtime.emitToUsers([userId], 'conversation:removed', { conversationId });
    this.announce(conversationId, message);
    return { message: 'Member removed' };
  }

  async leave(me: number, conversationId: string) {
    await this.requireType(conversationId, 'group');
    const mine = await this.requireMember(conversationId, me);
    await this.db.query(
      `UPDATE conversation_members SET "leftAt" = now() WHERE "conversationId" = $1 AND "userId" = $2`,
      [conversationId, me],
    );
    // The group needs an owner: the longest-standing admin, else the longest-standing member.
    if (mine.role === 'owner') {
      await this.db.query(
        `UPDATE conversation_members SET role = 'owner'
         WHERE ("conversationId", "userId") = (
           SELECT "conversationId", "userId" FROM conversation_members
           WHERE "conversationId" = $1 AND "leftAt" IS NULL
           ORDER BY (role = 'admin') DESC, "joinedAt" ASC LIMIT 1)`,
        [conversationId],
      );
    }
    const message = await this.postSystem(conversationId, `${await this.nameOf(me)} left`);
    this.announce(conversationId, message);
    return { message: 'You left the group' };
  }

  async setRole(me: number, conversationId: string, userId: number, role: 'admin' | 'member') {
    await this.requireType(conversationId, 'group');
    const actor = await this.requireMember(conversationId, me);
    if (actor.role !== 'owner') throw new ForbiddenException('Only the group owner can change roles');
    const target = await this.requireMember(conversationId, userId);
    if (target.role === 'owner') throw new BadRequestException('The owner keeps their role');
    await this.db.query(
      `UPDATE conversation_members SET role = $3 WHERE "conversationId" = $1 AND "userId" = $2`,
      [conversationId, userId, role],
    );
    this.realtime.emitToUsers(await this.memberIds(conversationId), 'conversation:updated', {
      conversationId,
    });
    return { message: 'Role updated' };
  }

  async mute(me: number, conversationId: string, hours: number | null) {
    await this.requireMember(conversationId, me);
    await this.db.query(
      `UPDATE conversation_members
       SET "mutedUntil" = CASE WHEN $3::int IS NULL THEN NULL ELSE now() + ($3::int * interval '1 hour') END
       WHERE "conversationId" = $1 AND "userId" = $2`,
      [conversationId, me, hours],
    );
    return { muted: hours !== null };
  }

  private announce(conversationId: string, message: object) {
    void this.memberIds(conversationId).then((ids) => {
      this.realtime.emitToUsers(ids, 'message:new', message);
      this.realtime.emitToUsers(ids, 'conversation:updated', { conversationId });
    });
  }
}
