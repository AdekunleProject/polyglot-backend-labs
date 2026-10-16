import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { Note } from './entities/note.entity';
import { User } from '../users/entities/user.entity';
import { FindNotesQueryDto } from './dto/find-notes-query.dto';

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

  async findAll(query: FindNotesQueryDto) {
    const [items, total] = await this.notesRepository.findAndCount({
      relations: { user: true },
      order: { createdAt: 'DESC' },
      take: query.limit,
      skip: (query.page - 1) * query.limit,
    });
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async findOne(id: number) {
    return `This action returns a #${id} note`;
  }

  async update(id: number, updateNoteDto: UpdateNoteDto) {
    return `This action updates a #${id} note`;
  }

  async remove(id: number) {
    return `This action removes a #${id} note`;
  }
}
