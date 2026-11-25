import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { BlocksService } from '../chat/blocks.service';
import { ConversationsService } from '../chat/conversations.service';
import { MessagesService } from '../chat/messages.service';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { rowsOf } from '../common/rows-of';
import { PushService } from '../devices/push.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CALL_MEDIA, CallMedia } from './call-media';

type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'cancelled';

interface CallRow {
  id: string;
  seq: number;
  conversationId: string;
  initiatorId: number;
  type: 'audio' | 'video';
  status: CallStatus;
  createdAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
}

const label = (type: string) => (type === 'video' ? 'video call' : 'voice call');

function minutes(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Ringing, answering and ending calls. The audio and video go through the
 * media server (LiveKit): this service only decides who may join, tells the
 * other people's phones, and leaves a record in the chat.
 */
@Injectable()
export class CallsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CallsService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private sweeper?: NodeJS.Timeout;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(CALL_MEDIA) private readonly media: CallMedia,
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
    private readonly config: ConfigService,
    private readonly blocks: BlocksService,
  ) {}

  private get ringSeconds() {
    return Number(this.config.get('CALL_RING_SECONDS')) || 45;
  }

  /** A call that was ringing when the server stopped will never be answered. A sweep also catches any lost timer. */
  async onApplicationBootstrap() {
    await this.sweep();
    this.sweeper = setInterval(() => void this.sweep(), 30_000);
    this.sweeper.unref();
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
    this.timers.forEach((t) => clearTimeout(t));
  }

  async sweep() {
    try {
      const stale = (await this.db.query(
        `SELECT id FROM calls WHERE status = 'ringing' AND "createdAt" < now() - ($1::int * interval '1 second')`,
        [this.ringSeconds + 5],
      )) as { id: string }[];
      for (const call of stale) await this.finish(call.id, 'missed');
      // An active call nobody is in any more (a crash) is ended.
      const empty = (await this.db.query(
        `SELECT c.id FROM calls c WHERE c.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM call_participants p WHERE p."callId" = c.id AND p.status = 'joined')`,
      )) as { id: string }[];
      for (const call of empty) await this.finish(call.id, 'ended');
    } catch (error) {
      this.logger.error(`Call sweep failed: ${(error as Error).message}`);
    }
  }

  // ---- Helpers ----

  private async load(callId: string): Promise<CallRow> {
    const valid = /^[0-9a-f-]{36}$/i.test(callId);
    const rows = valid ? ((await this.db.query(`SELECT * FROM calls WHERE id = $1`, [callId])) as CallRow[]) : [];
    if (!rows[0]) throw new NotFoundException('Call not found');
    return rows[0];
  }

  /** Strangers get "not found", the same as a call that does not exist. */
  private async requireParticipant(callId: string, userId: number) {
    const call = await this.load(callId);
    const rows = (await this.db.query(`SELECT status FROM call_participants WHERE "callId" = $1 AND "userId" = $2`, [
      callId,
      userId,
    ])) as { status: string }[];
    if (!rows[0]) throw new NotFoundException('Call not found');
    return { call, participant: rows[0].status };
  }

  private async participants(callId: string) {
    return (await this.db.query(
      `SELECT p."userId", p.status, u.username, u.firstname FROM call_participants p
       JOIN users u ON u.id = p."userId" WHERE p."callId" = $1 ORDER BY p."userId"`,
      [callId],
    )) as { userId: number; status: string; username: string; firstname: string }[];
  }

  private async view(call: CallRow) {
    const people = await this.participants(call.id);
    const seconds =
      call.answeredAt && call.endedAt
        ? Math.max(0, Math.round((new Date(call.endedAt).getTime() - new Date(call.answeredAt).getTime()) / 1000))
        : null;
    return {
      id: call.id,
      conversationId: call.conversationId,
      initiatorId: call.initiatorId,
      type: call.type,
      status: call.status,
      createdAt: call.createdAt,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
      durationSec: seconds,
      participants: people.map((p) => ({ userId: p.userId, username: p.username, status: p.status })),
    };
  }

  private async join(call: CallRow, userId: number) {
    const who = (await this.db.query(`SELECT firstname, lastname FROM users WHERE id = $1`, [userId])) as {
      firstname: string;
      lastname: string;
    }[];
    const room = `call_${call.id}`;
    const token = await this.media.createToken({
      room,
      identity: String(userId),
      name: `${who[0]?.firstname ?? ''} ${who[0]?.lastname ?? ''}`.trim() || String(userId),
    });
    return { url: this.media.url, room, token };
  }

  private async everyone(callId: string) {
    return (await this.participants(callId)).map((p) => p.userId);
  }

  // ---- Start ----

  async start(me: number, conversationId: string, type: 'audio' | 'video') {
    await this.conversations.requireMember(conversationId, me);
    const busy = (await this.db.query(
      `SELECT 1 FROM call_participants p JOIN calls c ON c.id = p."callId"
       WHERE p."userId" = $1 AND c.status IN ('ringing', 'active') AND p.status IN ('invited', 'joined')`,
      [me],
    )) as unknown[];
    if (busy.length > 0) throw new ConflictException('You are already in a call');

    const invitees = (await this.conversations.memberIds(conversationId)).filter((id) => id !== me);
    const max = Number(this.config.get('CALL_MAX_PARTICIPANTS')) || 32;
    if (invitees.length + 1 > max) throw new BadRequestException(`A call can have at most ${max} people`);
    if (invitees.length === 0) throw new BadRequestException('There is nobody to call');
    await this.conversations.assertSendable(conversationId, me);

    const id = randomUUID();
    const call = await this.db.transaction(async (tx) => {
      const rows = rowsOf<CallRow>(
        await tx.query(
          `INSERT INTO calls (id, "conversationId", "initiatorId", type) VALUES ($1, $2, $3, $4) RETURNING *`,
          [id, conversationId, me, type],
        ),
      );
      await tx.query(
        `INSERT INTO call_participants ("callId", "userId", status, "joinedAt") VALUES ($1, $2, 'joined', now())`,
        [id, me],
      );
      for (const userId of invitees) {
        await tx.query(`INSERT INTO call_participants ("callId", "userId", status) VALUES ($1, $2, 'invited')`, [
          id,
          userId,
        ]);
      }
      return rows[0];
    });

    const caller = (await this.db.query(`SELECT firstname, lastname, username FROM users WHERE id = $1`, [me])) as {
      firstname: string;
      lastname: string;
      username: string;
    }[];
    const group = (await this.db.query(`SELECT type, title FROM conversations WHERE id = $1`, [conversationId])) as {
      type: string;
      title: string | null;
    }[];
    const view = await this.view(call);
    this.realtime.emitToUsers(invitees, 'call:incoming', {
      call: view,
      from: { id: me, username: caller[0].username, firstname: caller[0].firstname, lastname: caller[0].lastname },
      groupTitle: group[0].type === 'group' ? group[0].title : null,
    });
    void this.ring(invitees, caller[0].firstname, type, call.id, group[0].title);

    const timer = setTimeout(() => void this.finish(call.id, 'missed'), this.ringSeconds * 1000);
    timer.unref();
    this.timers.set(call.id, timer);

    return { call: view, media: await this.join(call, me) };
  }

  /** A phone notification for people with no live connection. Real full-screen ringing needs the app's native call UI. */
  private async ring(userIds: number[], callerName: string, type: string, callId: string, title: string | null) {
    for (const userId of userIds) {
      if (await this.realtime.isOnline(userId)) continue;
      await this.push.send(userId, `Incoming ${label(type)}`, title ? `${callerName} in ${title}` : callerName, {
        type: 'call',
        callId,
      });
    }
  }

  // ---- Answer, decline, leave, end ----

  async accept(me: number, callId: string) {
    const { call, participant } = await this.requireParticipant(callId, me);
    if (call.status !== 'ringing' && call.status !== 'active') throw new ConflictException('This call has ended');
    if (participant === 'declined' || participant === 'left') {
      throw new ConflictException('You already left this call');
    }

    if (participant !== 'joined') {
      await this.db.query(
        `UPDATE call_participants SET status = 'joined', "joinedAt" = now() WHERE "callId" = $1 AND "userId" = $2`,
        [callId, me],
      );
      const first = rowsOf<CallRow>(
        await this.db.query(
          `UPDATE calls SET status = 'active', "answeredAt" = COALESCE("answeredAt", now())
           WHERE id = $1 AND status IN ('ringing', 'active') RETURNING *`,
          [callId],
        ),
      );
      if (first.length === 0) throw new ConflictException('This call has ended');
      const timer = this.timers.get(callId);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(callId);
      }
      this.realtime.emitToUsers(await this.everyone(callId), 'call:accepted', { callId, userId: me });
    }
    const fresh = await this.load(callId);
    return { call: await this.view(fresh), media: await this.join(fresh, me) };
  }

  async decline(me: number, callId: string) {
    const { call, participant } = await this.requireParticipant(callId, me);
    if (participant !== 'invited') throw new ConflictException('There is nothing to decline');
    if (call.status !== 'ringing' && call.status !== 'active') throw new ConflictException('This call has ended');
    await this.db.query(`UPDATE call_participants SET status = 'declined' WHERE "callId" = $1 AND "userId" = $2`, [
      callId,
      me,
    ]);
    this.realtime.emitToUsers(await this.everyone(callId), 'call:declined', { callId, userId: me });

    // Nobody left who could still answer: the call is over.
    const waiting = (await this.db.query(
      `SELECT 1 FROM call_participants WHERE "callId" = $1 AND "userId" <> $2 AND status IN ('invited', 'joined')
         AND "userId" <> $3`,
      [callId, me, call.initiatorId],
    )) as unknown[];
    if (call.status === 'ringing' && waiting.length === 0) await this.finish(callId, 'declined');
    return { message: 'Call declined' };
  }

  async leave(me: number, callId: string) {
    const { call, participant } = await this.requireParticipant(callId, me);
    if (participant !== 'joined') throw new ConflictException('You are not in this call');
    if (call.status !== 'ringing' && call.status !== 'active') return { message: 'Call already ended' };

    await this.db.query(
      `UPDATE call_participants SET status = 'left', "leftAt" = now() WHERE "callId" = $1 AND "userId" = $2`,
      [callId, me],
    );
    this.realtime.emitToUsers(await this.everyone(callId), 'call:left', { callId, userId: me });

    const [{ joined }] = (await this.db.query(
      `SELECT COUNT(*)::int AS joined FROM call_participants WHERE "callId" = $1 AND status = 'joined'`,
      [callId],
    )) as { joined: number }[];
    const direct = (await this.db.query(`SELECT type FROM conversations WHERE id = $1`, [call.conversationId])) as {
      type: string;
    }[];
    // The caller hanging up before anyone answered cancels it.
    if (call.status === 'ringing' && me === call.initiatorId) await this.finish(callId, 'cancelled');
    else if (joined === 0 || direct[0].type === 'direct') await this.finish(callId, 'ended');
    return { message: 'You left the call' };
  }

  /** The person who started the call ends it for everybody. */
  async end(me: number, callId: string) {
    const call = (await this.requireParticipant(callId, me)).call;
    if (call.initiatorId !== me) throw new ForbiddenException('Only the person who started the call can end it for everyone');
    await this.finish(callId, call.status === 'ringing' ? 'cancelled' : 'ended');
    return { message: 'Call ended' };
  }

  /**
   * Closes a call exactly once: the status change is the check, so two
   * requests ending the same call cannot both leave a record.
   */
  private async finish(callId: string, status: 'ended' | 'missed' | 'declined' | 'cancelled') {
    const closed = rowsOf<CallRow>(
      await this.db.query(
        `UPDATE calls SET status = $2, "endedAt" = now() WHERE id = $1 AND status IN ('ringing', 'active') RETURNING *`,
        [callId, status],
      ),
    );
    const call = closed[0];
    if (!call) return;
    const timer = this.timers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(callId);
    }
    const unanswered = rowsOf<{ userId: number }>(
      await this.db.query(
        `UPDATE call_participants SET status = 'missed' WHERE "callId" = $1 AND status = 'invited' RETURNING "userId"`,
        [callId],
      ),
    );
    await this.db.query(
      `UPDATE call_participants SET status = 'left', "leftAt" = now() WHERE "callId" = $1 AND status = 'joined'`,
      [callId],
    );

    const view = await this.view(call);
    const text =
      status === 'ended'
        ? `${label(call.type)[0].toUpperCase()}${label(call.type).slice(1)}${view.durationSec !== null ? ` · ${minutes(view.durationSec)}` : ''}`
        : status === 'declined'
          ? `Declined ${label(call.type)}`
          : `Missed ${label(call.type)}`;
    this.realtime.emitToUsers(await this.everyone(callId), 'call:ended', {
      callId,
      status,
      durationSec: view.durationSec,
    });
    try {
      await this.messages.postRich(
        call.initiatorId,
        call.conversationId,
        `call:${callId}`,
        'call',
        {
          kind: 'call',
          callId,
          callType: call.type,
          status,
          durationSec: view.durationSec,
          initiatorId: call.initiatorId,
        },
        text,
      );
    } catch (error) {
      this.logger.error(`Could not record call ${callId} in the chat: ${(error as Error).message}`);
    }
    if (status === 'missed' || status === 'cancelled') {
      for (const row of unanswered) {
        void this.push.send(row.userId, `Missed ${label(call.type)}`, text, { type: 'call', callId });
      }
    }
  }

  // ---- History ----

  async history(me: number, cursor: string | undefined, limit: number) {
    let before: number | null = null;
    if (cursor) {
      before = decodeCursor(cursor);
      if (before === null) throw new BadRequestException('Invalid cursor');
    }
    const rows = (await this.db.query(
      `SELECT c.*, p.status AS "myStatus" FROM calls c JOIN call_participants p ON p."callId" = c.id AND p."userId" = $1
       WHERE ($2::int IS NULL OR c.seq < $2) ORDER BY c.seq DESC LIMIT $3`,
      [me, before, limit + 1],
    )) as (CallRow & { myStatus: string })[];
    const page = rows.slice(0, limit);
    const items = [];
    for (const row of page) {
      items.push({ ...(await this.view(row)), direction: row.initiatorId === me ? 'outgoing' : 'incoming', myStatus: row.myStatus });
    }
    return { items, nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1].seq) : null };
  }

  async get(me: number, callId: string) {
    return this.view((await this.requireParticipant(callId, me)).call);
  }
}
