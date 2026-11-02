import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { AuthUser } from '../auth/auth-user.type';
import { CreateNoteDto } from './dto/create-note.dto';
import { FindNotesDto } from './dto/find-notes-query.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { Note } from './entities/note.entity';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(Note)
    private readonly notesRepository: Repository<Note>,
  ) {}

  create(dto: CreateNoteDto, user: AuthUser) {
    const note = this.notesRepository.create({
      title: dto.title,
      content: dto.content,
      user: { id: user.id },
    });
    return this.notesRepository.save(note);
  }

  async findAll(query: FindNotesDto, user: AuthUser) {
    const where: FindOptionsWhere<Note> = {};
    if (query.search) where.title = ILike(`%${query.search}%`);

    // normal users only ever see their own notes; admins may filter by any user
    const ownerId = user.role === 'admin' ? query.userId : user.id;
    if (ownerId) where.user = { id: ownerId };

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

  async findOne(id: number, user: AuthUser) {
    const note = await this.notesRepository.findOne({
      where: { id },
      relations: { user: true },
    });
    // someone else's note gets the same 404 as a missing one,
    // so users can't discover which ids exist
    if (!note || (user.role !== 'admin' && note.user.id !== user.id)) {
      throw new NotFoundException(`Note with id ${id} not found`);
    }
    return note;
  }

  async update(id: number, dto: UpdateNoteDto, user: AuthUser) {
    const note = await this.findOne(id, user);
    Object.assign(note, dto);
    return this.notesRepository.save(note);
  }

  async remove(id: number, user: AuthUser) {
    await this.findOne(id, user); // 404 + ownership check
    await this.notesRepository.delete(id);
    return { deleted: true };
  }
}
