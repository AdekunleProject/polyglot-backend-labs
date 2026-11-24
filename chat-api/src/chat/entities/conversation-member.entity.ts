import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export type MemberRole = 'owner' | 'admin' | 'member';

@Entity('conversation_members')
export class ConversationMember {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'PK_conversation_members' })
  conversationId: string;

  @PrimaryColumn({ type: 'integer', primaryKeyConstraintName: 'PK_conversation_members' })
  userId: number;

  @Column({ type: 'varchar', length: 10, default: 'member' })
  role: MemberRole;

  @CreateDateColumn({ type: 'timestamptz' })
  joinedAt: Date;

  // Set when the person leaves or is removed. History stays, access ends.
  @Column({ type: 'timestamptz', nullable: true })
  leftAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  lastDeliveredMessageId: number;

  @Column({ type: 'integer', default: 0 })
  lastReadMessageId: number;

  @Column({ type: 'timestamptz', nullable: true })
  mutedUntil: Date | null;
}
