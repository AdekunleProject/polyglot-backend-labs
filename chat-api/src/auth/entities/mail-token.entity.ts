import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum MailTokenPurpose {
  VERIFY_EMAIL = 'verify',
  RESET_PASSWORD = 'reset',
}

/**
 * A short code that was emailed to a user. Only a hash is stored, and a code
 * is deleted when it is used, so it works once.
 */
@Entity('mail_tokens')
export class MailToken {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_mail_tokens' })
  id: number;

  @Index('IDX_mail_tokens_userId')
  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_mail_tokens_userId',
  })
  user: User;

  @Column({ type: 'varchar', length: 10 })
  purpose: MailTokenPurpose;

  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiryDate: Date;

  @CreateDateColumn()
  createdAt: Date;
}
