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

/**
 * One-time backup code for someone who lost their authenticator. Only a hash
 * is stored, and the row is deleted when the code is used.
 */
@Entity('recovery_codes')
export class RecoveryCode {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_recovery_codes' })
  id: number;

  @Index('IDX_recovery_codes_userId')
  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_recovery_codes_userId',
  })
  user: User;

  @Column({ type: 'varchar', length: 64 })
  codeHash: string;

  @CreateDateColumn()
  createdAt: Date;
}
