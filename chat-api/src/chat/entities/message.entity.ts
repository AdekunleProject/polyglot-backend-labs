import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type MessageType = 'text' | 'image' | 'file' | 'voice' | 'video' | 'system';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  conversationId: string;

  // Null for system messages ("Ada added Bob") and after a sender's account is erased.
  @Column({ type: 'integer', nullable: true })
  senderId: number | null;

  @Column({ type: 'varchar', length: 10, default: 'text' })
  type: MessageType;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'integer', nullable: true })
  replyToId: number | null;

  // Files, images and voice notes: { key, mime, size, durationMs?, waveform? }
  @Column({ type: 'jsonb', nullable: true })
  media: Record<string, unknown> | null;

  // Chosen by the phone. Sending the same one twice returns the first message.
  @Column({ type: 'varchar', length: 64, nullable: true })
  clientId: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
