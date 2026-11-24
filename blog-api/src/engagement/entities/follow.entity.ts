import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('follows')
export class Follow {
  @PrimaryColumn({ type: 'integer', primaryKeyConstraintName: 'PK_follows' })
  followerId: number;

  @PrimaryColumn({ type: 'integer', primaryKeyConstraintName: 'PK_follows' })
  followingId: number;

  @CreateDateColumn()
  createdAt: Date;
}
