import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** A phone's push token. One token belongs to one account at a time. */
@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  token: string;

  @Column({ type: 'varchar', length: 10 })
  platform: 'ios' | 'android' | 'web';

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'now()' })
  lastSeenAt: Date;
}
