import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AuditLog } from './audit/entities/audit-log.entity';
import { Comment } from './comments/entities/comment.entity';
import { Post } from './posts/entities/post.entity';
import { Tag } from './tags/entities/tag.entity';
import { MailToken } from './auth/entities/mail-token.entity';
import { RecoveryCode } from './auth/entities/recovery-code.entity';
import { Session } from './auth/entities/session.entity';
import { Bookmark } from './engagement/entities/bookmark.entity';
import { Follow } from './engagement/entities/follow.entity';
import { PostLike } from './engagement/entities/post-like.entity';
import { Device } from './notifications/entities/device.entity';
import { Notification } from './notifications/entities/notification.entity';
import { User } from './users/entities/user.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true',
  entities: [User, Post, Tag, Comment, Session, MailToken, RecoveryCode, AuditLog, Device, Notification, PostLike, Bookmark, Follow],
  migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
});
