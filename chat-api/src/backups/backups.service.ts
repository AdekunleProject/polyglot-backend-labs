import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { FileUpload } from '../aws/aws.file-upload';
import { encryptBackup } from './backup-crypto';

const KEEP_LAST = 5;

interface BackupRow {
  id: string;
  userId: number;
  status: 'pending' | 'ready' | 'failed';
  key: string | null;
  sizeBytes: string | null;
  conversationCount: number | null;
  messageCount: number | null;
  createdAt: Date;
  finishedAt: Date | null;
}

@Injectable()
export class BackupsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly files: FileUpload,
    private readonly config: ConfigService,
  ) {}

  /** A backup that was running when the server stopped will never finish. */
  async onApplicationBootstrap() {
    await this.db.query(`UPDATE backups SET status = 'failed', "finishedAt" = now() WHERE status = 'pending'`);
  }

  private view(row: BackupRow) {
    return {
      id: row.id,
      status: row.status,
      sizeBytes: row.sizeBytes ? Number(row.sizeBytes) : null,
      conversationCount: row.conversationCount,
      messageCount: row.messageCount,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
    };
  }

  /** Starts the export and answers at once. The phone polls GET /backups/:id. */
  async create(userId: number, password: string) {
    const running = (await this.db.query(`SELECT 1 FROM backups WHERE "userId" = $1 AND status = 'pending'`, [
      userId,
    ])) as unknown[];
    if (running.length > 0) throw new ConflictException('A backup is already running');

    const id = randomUUID();
    await this.db.query(`INSERT INTO backups (id, "userId") VALUES ($1, $2)`, [id, userId]);
    // The password stays in memory for this one job and is never written anywhere.
    setImmediate(() => void this.run(id, userId, password));
    return { id, status: 'pending' as const };
  }

  private async run(id: string, userId: number, password: string) {
    try {
      const data = await this.collect(userId);
      const archive = encryptBackup(data, password);
      const key = `backups/${userId}/${id}.chatbackup`;
      await this.files.putObject(key, archive, 'application/octet-stream');
      await this.db.query(
        `UPDATE backups SET status = 'ready', key = $2, "sizeBytes" = $3, "conversationCount" = $4,
                "messageCount" = $5, "finishedAt" = now() WHERE id = $1`,
        [id, key, archive.length, data.conversations.length, data.messageCount],
      );
      await this.prune(userId);
    } catch (error) {
      this.logger.error(`Backup ${id} failed: ${(error as Error).message}`);
      await this.db.query(`UPDATE backups SET status = 'failed', "finishedAt" = now() WHERE id = $1`, [id]);
    }
  }

  /** Everything the person can see: their chats, the people in them, and the messages since they joined. */
  private async collect(userId: number) {
    const limit = Number(this.config.get('MAX_BACKUP_MESSAGES')) || 200_000;
    const me = ((await this.db.query(`SELECT id, username, firstname, lastname FROM users WHERE id = $1`, [userId])) as unknown[])[0];
    const chats = (await this.db.query(
      `SELECT c.id, c.type, c.title, c."createdAt", m."joinedAt"
       FROM conversation_members m JOIN conversations c ON c.id = m."conversationId"
       WHERE m."userId" = $1 AND m."leftAt" IS NULL ORDER BY c."createdAt"`,
      [userId],
    )) as { id: string; type: string; title: string | null; createdAt: Date; joinedAt: Date }[];

    let messageCount = 0;
    const conversations = [];
    for (const chat of chats) {
      const members = await this.db.query(
        `SELECT u.id, u.username, u.firstname, u.lastname, m.role FROM conversation_members m
         JOIN users u ON u.id = m."userId" WHERE m."conversationId" = $1 AND m."leftAt" IS NULL ORDER BY u.id`,
        [chat.id],
      );
      const remaining = limit - messageCount;
      if (remaining <= 0) throw new BadRequestException(`Too many messages to back up (limit ${limit})`);
      const messages = (await this.db.query(
        `SELECT id, "senderId", type, body, "replyToId", media, "createdAt", "editedAt"
         FROM messages WHERE "conversationId" = $1 AND "createdAt" >= $2 AND "deletedAt" IS NULL
         ORDER BY id LIMIT $3`,
        [chat.id, chat.joinedAt, remaining],
      )) as { media: Record<string, unknown> | null }[];
      messageCount += messages.length;
      conversations.push({
        id: chat.id,
        type: chat.type,
        title: chat.type === 'group' ? chat.title : null,
        createdAt: chat.createdAt,
        members,
        // Only a description of each file. The files stay in storage while the chat exists.
        messages: messages.map((m) => ({
          ...m,
          media: m.media
            ? {
                id: m.media.id,
                kind: m.media.kind,
                name: m.media.name,
                contentType: m.media.contentType,
                size: m.media.size,
                durationMs: m.media.durationMs,
              }
            : null,
        })),
      });
    }
    return { format: 'chat-backup', version: 1, createdAt: new Date().toISOString(), user: me, messageCount, conversations };
  }

  /** Keeps the newest few backups and removes the rest, files included. */
  private async prune(userId: number) {
    const old = (await this.db.query(
      `SELECT id, key FROM backups WHERE "userId" = $1 ORDER BY "createdAt" DESC OFFSET $2`,
      [userId, KEEP_LAST],
    )) as { id: string; key: string | null }[];
    for (const row of old) {
      if (row.key) await this.files.deleteFile(row.key);
      await this.db.query(`DELETE FROM backups WHERE id = $1`, [row.id]);
    }
  }

  async list(userId: number) {
    const rows = (await this.db.query(`SELECT * FROM backups WHERE "userId" = $1 ORDER BY "createdAt" DESC`, [
      userId,
    ])) as BackupRow[];
    return rows.map((row) => this.view(row));
  }

  private async mine(userId: number, id: string) {
    const valid = /^[0-9a-f-]{36}$/i.test(id);
    const rows = valid
      ? ((await this.db.query(`SELECT * FROM backups WHERE id = $1 AND "userId" = $2`, [id, userId])) as BackupRow[])
      : [];
    if (!rows[0]) throw new NotFoundException('Backup not found');
    return rows[0];
  }

  async get(userId: number, id: string) {
    const row = await this.mine(userId, id);
    const downloadUrl = row.status === 'ready' && row.key ? await this.files.getDownloadUrl(row.key) : null;
    return { ...this.view(row), downloadUrl };
  }

  async remove(userId: number, id: string) {
    const row = await this.mine(userId, id);
    if (row.key) await this.files.deleteFile(row.key);
    await this.db.query(`DELETE FROM backups WHERE id = $1`, [row.id]);
    return { message: 'Backup deleted' };
  }
}
