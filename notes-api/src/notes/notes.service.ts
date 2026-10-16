import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository, FindOptionsWhere, ILike } from 'typeorm';
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
    const where: FindOptionsWhere<Note> = {};
    if (query.search) {
      where.title = ILike(`%${query.search}%`);
    }
    if (query.userId) {
      where.user = { id: query.userId };
    }

    const [items, total] = await this.notesRepository.findAndCount({
      where,
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
    const note = await this.notesRepository.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!note) {
      throw new NotFoundException(`Note with id ${id} not found`);
    }
    return note;
  }

  async update(id: number, updateNoteDto: UpdateNoteDto) {
    const note = await this.findOne(id);
    Object.assign(note, updateNoteDto);
    return this.notesRepository.save(note);
  }

  async remove(id: number) {
    const result = await this.notesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Note with id ${id} not found`);
    }
    return { deleted: true };
  }
}
