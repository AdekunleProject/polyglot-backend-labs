import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * One row per signed-in device. The refresh token itself is never stored,
 * only its SHA-256 hash, so a database leak does not leak usable tokens.
 */
@Entity('sessions')
export class Session {
  // Generated in code (randomUUID) so no database extension is needed.
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'PK_sessions' })
  id: string;

  @Index('IDX_sessions_userId')
  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'FK_sessions_userId' })
  user: User;

  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  // What the app called the device, for example "Ada's iPhone".
  @Column({ type: 'varchar', length: 100, nullable: true })
  deviceName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'now()' })
  lastUsedAt: Date;
}
