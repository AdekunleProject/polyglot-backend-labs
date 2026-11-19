import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { Comment } from './comments/entities/comment.entity';
import { Post } from './posts/entities/post.entity';
import { Tag } from './tags/entities/tag.entity';
import { MailToken } from './auth/entities/mail-token.entity';
import { Session } from './auth/entities/session.entity';
import { User } from './users/entities/user.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true',
  entities: [User, Post, Tag, Comment, Session, MailToken],
  migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
});
