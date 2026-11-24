import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export type ConversationType = 'direct' | 'group';

@Entity('conversations')
export class Conversation {
  // Generated in code (randomUUID), so ids cannot be guessed or counted.
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'PK_conversations' })
  id: string;

  @Column({ type: 'varchar', length: 10 })
  type: ConversationType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  title: string | null;

  // "3:17" for a chat between users 3 and 17. Makes sure a pair has one chat.
  @Column({ type: 'varchar', length: 32, nullable: true, unique: true })
  directKey: string | null;

  @Column({ type: 'integer', nullable: true })
  createdById: number | null;

  @Column({ type: 'integer', nullable: true })
  lastMessageId: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
