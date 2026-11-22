import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One row per sensitive action: who did it, to whom, and when. The ids are
 * plain numbers, not foreign keys, so the history survives if an account is
 * ever removed for good.
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', nullable: true })
  actorId: number | null;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'integer', nullable: true })
  targetUserId: number | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @Index('IDX_audit_logs_createdAt')
  @CreateDateColumn()
  createdAt: Date;
}
