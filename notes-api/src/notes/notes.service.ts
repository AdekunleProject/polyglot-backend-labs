import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { Note } from './entities/note.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Note)
    private readonly notesRepository: Repository<Note>,
  ) {}

  async create(createNoteDto: CreateNoteDto) {
    const user = await this.usersRepository.findOneBy({
      id: createNoteDto.userId,
    });
    if (!user) {
      throw new NotFoundException(
        `User with id ${createNoteDto.userId} not found`,
      );
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
