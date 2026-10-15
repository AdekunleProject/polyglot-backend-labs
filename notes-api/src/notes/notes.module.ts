import { Module } from '@nestjs/common';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './entities/note.entity';
import { User } from '../users/entities/user.entity';

@Module({
  // forFeature([Note]) registers the entity. Without it, the table is never created.
  imports: [TypeOrmModule.forFeature([Note, User])],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
