import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('notes')
export class Note {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 200 })
  title: string;

  // gives a TEXT column with no length limit, right for a note’s body. A title stays varchar(200).
  @Column('text')
  content: string;

  // fills in the date on insert, like created_at TIMESTAMP DEFAULT NOW().
  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: false })
  isPinned: boolean;

  // @ManyToOne is the side that holds the foreign key. TypeORM creates a userId column in
  // notes, the same idea as your user_id REFERENCES users(id).
  // nullable: false matches the NOT NULL from design.md.
  // onDelete: 'CASCADE' deletes a user’s notes when the user is deleted.
  // The () => User arrow function avoids a circular-import problem, since the two files reference
  // each other.
  @ManyToOne(() => User, (user) => user.notes, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  user: User;
}
