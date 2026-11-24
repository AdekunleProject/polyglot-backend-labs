import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('post_likes')
export class PostLike {
  @PrimaryColumn({ type: 'integer', primaryKeyConstraintName: 'PK_post_likes' })
  userId: number;

  @PrimaryColumn({ type: 'integer', primaryKeyConstraintName: 'PK_post_likes' })
  postId: number;

  @CreateDateColumn()
  createdAt: Date;
}
