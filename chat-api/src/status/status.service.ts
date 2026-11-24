import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConversationsService } from '../chat/conversations.service';
import { MediaService, StoredMedia } from '../chat/media.service';
import { MessagesService } from '../chat/messages.service';
import { rowsOf } from '../common/rows-of';
import { RealtimeService } from '../realtime/realtime.service';
import type { CreateStatusDto } from './dto/status.dto';

interface StatusRow {
  id: number;
  userId: number;
  type: 'text' | 'image' | 'video';
  body: string | null;
  bgColor: string | null;
  media: StoredMedia | null;
  privacy: 'contacts' | 'only' | 'except';
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Can viewer $1 see status s? Only people who share a direct chat with the
 * poster, narrowed by the poster's choice. Used in every read so no route can forget it.
 */
const VISIBLE_TO_1 = `
  s."deletedAt" IS NULL AND s."expiresAt" > now() AND s."userId" <> $1
  AND EXISTS (
    SELECT 1 FROM conversations c
    JOIN conversation_members a ON a."conversationId" = c.id AND a."userId" = $1 AND a."leftAt" IS NULL
    JOIN conversation_members b ON b."conversationId" = c.id AND b."userId" = s."userId" AND b."leftAt" IS NULL
    WHERE c.type = 'direct')
  AND (s.privacy = 'contacts'
    OR (s.privacy = 'only' AND EXISTS (SELECT 1 FROM status_audience x WHERE x."statusId" = s.id AND x."userId" = $1))
    OR (s.privacy = 'except' AND NOT EXISTS (SELECT 1 FROM status_audience x WHERE x."statusId" = s.id AND x."userId" = $1)))`;

const MAX_ACTIVE = 30;

@Injectable()
export class StatusService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(StatusService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly media: MediaService,
    private readonly messages: MessagesService,
    private readonly conversations: ConversationsService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService,
  ) {}

  /** Expired posts disappear from every read at once; this sweep removes the rows and files. */
  onApplicationBootstrap() {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => void this.sweep(), 60 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep() {
    try {
      const gone = rowsOf<{ media: StoredMedia | null }>(
        await this.db.query(
          `DELETE FROM statuses WHERE "expiresAt" < now() - interval '5 minutes' OR "deletedAt" IS NOT NULL RETURNING media`,
        ),
      );
      for (const row of gone) await this.media.discard(row.media);
      await this.db.query(
        `DELETE FROM status_views WHERE "statusId" NOT IN (SELECT id FROM statuses);
         DELETE FROM status_audience WHERE "statusId" NOT IN (SELECT id FROM statuses)`,
      );
      return gone.length;
    } catch (error) {
      this.logger.error(`Status sweep failed: ${(error as Error).message}`);
      return 0;
    }
  }

  private async render(row: StatusRow, extra: Record<string, unknown> = {}) {
    return {
      id: row.id,
      type: row.type,
      body: row.body,
      bgColor: row.bgColor,
      media: await this.media.view(row.media),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      ...extra,
    };
  }

  // ---- Post ----

  async create(me: number, dto: CreateStatusDto) {
    const body = dto.body?.trim() || null;
    const privacy = dto.privacy ?? 'contacts';
    const audience = [...new Set(dto.audienceIds ?? [])].filter((id) => id !== me);
    if (privacy !== 'contacts' && audience.length === 0) {
      throw new BadRequestException('Choose at least one person for this audience');
    }
    if (privacy === 'contacts' && audience.length > 0) {
      throw new BadRequestException('audienceIds only goes with "only" or "except"');
    }

    const active = (await this.db.query(
      `SELECT COUNT(*)::int AS total FROM statuses WHERE "userId" = $1 AND "deletedAt" IS NULL AND "expiresAt" > now()`,
      [me],
    )) as { total: number }[];
    if (active[0].total >= MAX_ACTIVE) {
      throw new BadRequestException(`You can have at most ${MAX_ACTIVE} statuses at a time`);
    }

    let stored: StoredMedia | null = null;
    if (dto.type === 'text') {
      if (!body) throw new BadRequestException('A text status needs text');
      if (dto.mediaId) throw new BadRequestException('A text status has no attachment');
    } else {
      if (!dto.mediaId) throw new BadRequestException(`A ${dto.type} status needs a mediaId`);
      stored = await this.media.claim(me, null, dto.mediaId, dto.type);
      if (dto.type === 'video') {
        const max = Number(this.config.get('STATUS_MAX_VIDEO_SECONDS')) || 60;
        if (!stored.durationMs) throw new BadRequestException('A video status needs durationMs on its upload');
        if (stored.durationMs > max * 1000) {
          throw new BadRequestException(`A video status can be at most ${max} seconds`);
        }
      }
    }

    const hours = Number(this.config.get('STATUS_TTL_HOURS')) || 24;
    const rows = rowsOf<StatusRow>(
      await this.db.query(
        `INSERT INTO statuses ("userId", type, body, "bgColor", media, privacy, "expiresAt")
         VALUES ($1, $2, $3, $4, $5, $6, now() + ($7::numeric * interval '1 hour')) RETURNING *`,
        [me, dto.type, body, dto.type === 'text' ? dto.bgColor ?? null : null, stored ? JSON.stringify(stored) : null, privacy, hours],
      ),
    );
    const row = rows[0];
    if (stored) await this.media.attach(stored.id, row.id);
    for (const id of audience) {
      await this.db.query(`INSERT INTO status_audience ("statusId", "userId") VALUES ($1, $2)`, [row.id, id]);
    }

    // Tell the people who can see it, so their app can show a new ring.
    const watchers = (await this.db.query(
      `SELECT u.id FROM users u JOIN statuses s ON s.id = $1
       WHERE u.id <> $2 AND u."isActive" = true AND u."deletedAt" IS NULL AND ${VISIBLE_TO_1.replace(/\$1/g, 'u.id')}`,
      [row.id, me],
    )) as { id: number }[];
    this.realtime.emitToUsers(
      watchers.map((w) => w.id),
      'status:new',
      { userId: me, statusId: row.id },
    );
    return this.render(row, { privacy, audienceIds: audience });
  }

  // ---- Read ----

  /** Other people's active statuses, one entry per person, unseen first. */
  async feed(me: number) {
    const rows = (await this.db.query(
      `SELECT s.*, u.username, u.firstname, u.lastname, (v."viewerId" IS NOT NULL) AS viewed
       FROM statuses s
       JOIN users u ON u.id = s."userId" AND u."isActive" = true AND u."deletedAt" IS NULL
       LEFT JOIN status_views v ON v."statusId" = s.id AND v."viewerId" = $1
       WHERE ${VISIBLE_TO_1} ORDER BY s.id`,
      [me],
    )) as (StatusRow & { username: string; firstname: string; lastname: string; viewed: boolean })[];

    const byPerson = new Map<number, { user: Record<string, unknown>; statuses: unknown[]; allViewed: boolean; latest: number }>();
    for (const row of rows) {
      let group = byPerson.get(row.userId);
      if (!group) {
        group = {
          user: { id: row.userId, username: row.username, firstname: row.firstname, lastname: row.lastname },
          statuses: [],
          allViewed: true,
          latest: 0,
        };
        byPerson.set(row.userId, group);
      }
      group.statuses.push(await this.render(row, { viewed: row.viewed }));
      group.allViewed = group.allViewed && row.viewed;
      group.latest = row.id;
    }
    return [...byPerson.values()]
      .sort((a, b) => Number(a.allViewed) - Number(b.allViewed) || b.latest - a.latest)
      .map(({ latest: _latest, ...group }) => group);
  }

  async mine(me: number) {
    const rows = (await this.db.query(
      `SELECT s.*, (SELECT COUNT(*)::int FROM status_views v WHERE v."statusId" = s.id) AS "viewCount"
       FROM statuses s WHERE s."userId" = $1 AND s."deletedAt" IS NULL AND s."expiresAt" > now() ORDER BY s.id DESC`,
      [me],
    )) as (StatusRow & { viewCount: number })[];
    return Promise.all(rows.map((row) => this.render(row, { privacy: row.privacy, viewCount: row.viewCount })));
  }

  private async visible(me: number, id: number): Promise<StatusRow> {
    const rows = (await this.db.query(`SELECT s.* FROM statuses s WHERE s.id = $2 AND ${VISIBLE_TO_1}`, [
      me,
      id,
    ])) as StatusRow[];
    // "Not found" for anything you may not see, so ids reveal nothing.
    if (!rows[0]) throw new NotFoundException('Status not found');
    return rows[0];
  }

  async view(me: number, id: number) {
    const row = await this.visible(me, id);
    const inserted = (await this.db.query(
      `INSERT INTO status_views ("statusId", "viewerId") VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING "statusId"`,
      [id, me],
    )) as unknown[];
    // Only the first view tells the poster.
    if (inserted.length > 0) this.realtime.emitToUsers([row.userId], 'status:viewed', { statusId: id, viewerId: me });
    return { viewed: true };
  }

  async viewers(me: number, id: number) {
    await this.owned(me, id);
    return this.db.query(
      `SELECT u.id, u.username, u.firstname, u.lastname, v."viewedAt"
       FROM status_views v JOIN users u ON u.id = v."viewerId" WHERE v."statusId" = $1 ORDER BY v."viewedAt" DESC`,
      [id],
    );
  }

  private async owned(me: number, id: number): Promise<StatusRow> {
    const rows = (await this.db.query(`SELECT * FROM statuses WHERE id = $1 AND "deletedAt" IS NULL`, [id])) as StatusRow[];
    if (!rows[0]) throw new NotFoundException('Status not found');
    if (rows[0].userId !== me) throw new ForbiddenException('That is not your status');
    return rows[0];
  }

  async remove(me: number, id: number) {
    const row = await this.owned(me, id);
    await this.db.query(`UPDATE statuses SET "deletedAt" = now() WHERE id = $1`, [id]);
    await this.media.discard(row.media);
    return { message: 'Status deleted' };
  }

  /** A reply goes to the poster as a normal chat message that quotes the status. */
  async reply(me: number, id: number, clientId: string, body: string) {
    const row = await this.visible(me, id);
    const chat = await this.conversations.createDirect(me, row.userId);
    const preview = (row.body ?? (row.type === 'video' ? 'Video' : 'Photo')).slice(0, 80);
    return this.messages.send(me, {
      conversationId: chat.id,
      clientId,
      body: `Replying to your status "${preview}":\n${body.trim()}`,
    });
  }
}
