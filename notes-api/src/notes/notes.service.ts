import { Injectable } from '@nestjs/common';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { User } from '../users/entities/user.entity';
import { Repository } from 'typeorm/browser/repository/Repository.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Note } from './entities/note.entity';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Note)
    private readonly notesRepository: Repository<Note>,
  ) {}

  create(createNoteDto: CreateNoteDto) {
    const user = this.userRepository.findOneBy({id: createNoteDto.userId})
    if (!user){
      throw new Error(`User with id ${createNoteDto.userId} not found`);
    }
    const note = this.notesRepository.create({
      title: createNoteDto.title,
      content: createNoteDto.content,
      user: { id: createNoteDto.userId },
    });
    return this.notesRepository.save(note);
  }

  findAll() {
    return this.notesRepository.find({
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
  }
  
  findOne(id: number) {
    return `This action returns a #${id} note`;
  }

  update(id: number, updateNoteDto: UpdateNoteDto) {
    return `This action updates a #${id} note`;
  }

  remove(id: number) {
    return `This action removes a #${id} note`;
  }
}
