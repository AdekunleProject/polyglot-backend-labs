import {IsNotEmpty, IsString, IsEmail, MaxLength} from 'class-validator';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Note } from '../../notes/entities/note.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({length: 100})
  @IsNotEmpty()
  @IsString()
  name: string;

  @Column({ length: 150, unique: true })
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  email: string;

  // @OneToMany creates no column. It only lets you load a user’s notes from the user side.   
  @OneToMany(() => Note, (note) => note.user)
  notes: Note[]
}           
