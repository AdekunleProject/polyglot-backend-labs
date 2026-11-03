import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Comment } from './comments/entities/comment.entity';
import { Post } from './posts/entities/post.entity';
import { Tag } from './tags/entities/tag.entity';
import { User } from './users/entities/user.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [User, Post, Tag, Comment],
  migrations: ['src/migrations/*.ts'],
});
