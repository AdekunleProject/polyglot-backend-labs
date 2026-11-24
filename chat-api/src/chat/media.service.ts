import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { FileUpload } from '../aws/aws.file-upload';
import { ConversationsService } from './conversations.service';
import type { CreateUploadDto } from './dto/chat.dto';
import {
  MAX_VOICE_SECONDS_DEFAULT,
  MediaKind,
  extensionFor,
  maxBytes,
  safeName,
} from './media-rules';

interface UploadRow {
  id: string;
  ownerId: number;
  conversationId: string;
  kind: MediaKind;
  key: string;
  contentType: string;
  size: string;
  name: string | null;
  durationMs: number | null;
  waveform: number[] | null;
  width: number | null;
  height: number | null;
  messageId: number | null;
}

/** What is stored inside a message. The object key never leaves the server. */
export interface StoredMedia {
  id: string;
  kind: MediaKind;
  key: string;
  contentType: string;
  size: number;
  name: string | null;
  durationMs: number | null;
  waveform: number[] | null;
  width: number | null;
  height: number | null;
}

@Injectable()
export class MediaService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly conversations: ConversationsService,
    private readonly files: FileUpload,
    private readonly config: ConfigService,
  ) {}

  private env = (key: string) => this.config.get<string>(key);

  /** Step 1: the phone asks where to upload. Nothing is stored yet. */
  async createUpload(me: number, dto: CreateUploadDto) {
    await this.conversations.requireMember(dto.conversationId, me);
    const extension = extensionFor(dto.kind, dto.contentType);
    if (!extension) {
      throw new BadRequestException(`That file type is not allowed for ${dto.kind}`);
    }
    const limit = maxBytes(dto.kind, this.env);
    if (dto.size > limit) {
      throw new BadRequestException(
        `That ${dto.kind} is too large (limit ${Math.round(limit / 1024 / 1024)} MB)`,
      );
    }
    if (dto.kind === 'voice') {
      const max = Number(this.env('MAX_VOICE_SECONDS')) || MAX_VOICE_SECONDS_DEFAULT;
      if (!dto.durationMs) throw new BadRequestException('A voice note needs durationMs');
      if (dto.durationMs > max * 1000) {
        throw new BadRequestException(`A voice note can be at most ${max} seconds`);
      }
    }

    const id = randomUUID();
    // The key is made here, never taken from the client's file name.
    const key = `chat/${dto.conversationId}/${id}${extension}`;
    const uploadUrl = await this.files.createUploadUrl(key, dto.contentType, dto.size);
    await this.db.query(
      `INSERT INTO media_uploads (id, "ownerId", "conversationId", kind, key, "contentType", size, name,
                                  "durationMs", waveform, width, height)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        me,
        dto.conversationId,
        dto.kind,
        key,
        dto.contentType.toLowerCase(),
        dto.size,
        safeName(dto.filename),
        dto.durationMs ?? null,
        dto.waveform ? JSON.stringify(dto.waveform) : null,
        dto.width ?? null,
        dto.height ?? null,
      ],
    );
    return {
      mediaId: id,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': dto.contentType.toLowerCase() },
      expiresInSeconds: 900,
    };
  }

  /**
   * Step 3: the message is being sent. The upload must be yours, for this
   * chat, finished, the size you declared, and not used by another message.
   */
  async claim(me: number, conversationId: string, mediaId: string, type: MediaKind): Promise<StoredMedia> {
    const rows = (await this.db.query(`SELECT * FROM media_uploads WHERE id = $1`, [mediaId])) as UploadRow[];
    const upload = rows[0];
    if (!upload || upload.ownerId !== me || upload.conversationId !== conversationId) {
      throw new BadRequestException('Unknown upload');
    }
    if (upload.kind !== type) throw new BadRequestException(`That upload is a ${upload.kind}, not a ${type}`);
    if (upload.messageId) throw new BadRequestException('That upload was already sent');

    const stored = await this.files.headFile(upload.key);
    if (!stored) throw new BadRequestException('The upload did not finish. Upload the file, then send.');
    if (stored.size > Number(upload.size) || stored.size > maxBytes(upload.kind, this.env)) {
      await this.files.deleteFile(upload.key);
      throw new BadRequestException('The uploaded file is larger than declared');
    }

    return {
      id: upload.id,
      kind: upload.kind,
      key: upload.key,
      contentType: upload.contentType,
      size: stored.size,
      name: upload.name,
      durationMs: upload.durationMs,
      waveform: upload.waveform,
      width: upload.width,
      height: upload.height,
    };
  }

  async attach(mediaId: string, messageId: number) {
    await this.db.query(`UPDATE media_uploads SET "messageId" = $2 WHERE id = $1`, [mediaId, messageId]);
  }

  /** A deleted message takes its file with it. */
  async discard(media: StoredMedia | null) {
    if (!media?.key) return;
    await this.files.deleteFile(media.key);
  }

  /** What the app receives: a temporary link, never the key. */
  async view(media: StoredMedia | null) {
    if (!media) return null;
    let url: string | null = null;
    try {
      url = await this.files.getDownloadUrl(media.key);
    } catch {
      url = null;
    }
    const { key: _key, ...rest } = media;
    return { ...rest, url };
  }
}
