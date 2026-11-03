import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type';
import { Tag } from '../tags/entities/tag.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { FindPostsQueryDto } from './dto/find-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { Post } from './entities/post.entity';

const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post) private readonly postsRepository: Repository<Post>,
    @InjectRepository(Tag) private readonly tagsRepository: Repository<Tag>,
  ) {}

  // Turn ['NestJS', 'sql'] into Tag rows, creating the ones that don't exist yet.
  private async resolveTags(names: string[] = []) {
    const clean = [...new Set(names.map((n) => n.trim().toLowerCase()))].filter(
      Boolean,
    );
    if (clean.length === 0) return [];
    const existing = await this.tagsRepository.findBy({ name: In(clean) });
    const known = new Set(existing.map((t) => t.name));
    const created = await this.tagsRepository.save(
      clean.filter((n) => !known.has(n)).map((name) => ({ name })),
    );
    return [...existing, ...created];
  }

  async create(dto: CreatePostDto, user: AuthUser) {
    const slug = `${slugify(dto.title)}-${Date.now().toString(36)}`;
    const post = this.postsRepository.create({
      title: dto.title,
      content: dto.content,
      published: dto.published ?? false,
      slug,
      author: { id: user.id },
      tags: await this.resolveTags(dto.tags),
    });
    return this.postsRepository.save(post);
  }

  async findAll(query: FindPostsQueryDto) {
    const qb = this.postsRepository
      .createQueryBuilder('post')
      .leftJoin('post.author', 'author')
      .addSelect(['author.id', 'author.name'])
      .leftJoinAndSelect('post.tags', 'tag')
      .where('post.published = true');

    if (query.tag) {
      qb.innerJoin('post.tags', 'filterTag', 'filterTag.name = :tag', {
        tag: query.tag.toLowerCase(),
      });
    }
    if (query.search) {
      qb.andWhere('post.title ILIKE :search', { search: `%${query.search}%` });
    }

    const [items, total] = await qb
      .orderBy('post.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  mine(user: AuthUser) {
    return this.postsRepository.find({
      where: { author: { id: user.id } },
      relations: { tags: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findBySlug(slug: string) {
    const post = await this.postsRepository
      .createQueryBuilder('post')
      .leftJoin('post.author', 'author')
      .addSelect(['author.id', 'author.name'])
      .leftJoinAndSelect('post.tags', 'tag')
      .where('post.slug = :slug AND post.published = true', { slug })
      .getOne();
    if (!post) throw new NotFoundException(`Post "${slug}" not found`);
    return post;
  }

  private async findOwned(id: number, user: AuthUser) {
    const post = await this.postsRepository.findOne({
      where: { id },
      relations: { author: true, tags: true },
    });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    if (user.role !== 'admin' && post.author.id !== user.id) {
      throw new ForbiddenException('You can only change your own posts');
    }
    return post;
  }

  async update(id: number, dto: UpdatePostDto, user: AuthUser) {
    const post = await this.findOwned(id, user);
    if (dto.title !== undefined) post.title = dto.title;
    if (dto.content !== undefined) post.content = dto.content;
    if (dto.published !== undefined) post.published = dto.published;
    if (dto.tags !== undefined) post.tags = await this.resolveTags(dto.tags);
    return this.postsRepository.save(post);
  }

  async remove(id: number, user: AuthUser) {
    await this.findOwned(id, user);
    await this.postsRepository.delete(id);
    return { deleted: true };
  }

  async tagsWithCounts() {
    const rows = await this.tagsRepository
      .createQueryBuilder('tag')
      .leftJoin('tag.posts', 'post')
      .select('tag.id', 'id')
      .addSelect('tag.name', 'name')
      .addSelect('COUNT(post.id)', 'postCount')
      .groupBy('tag.id')
      .orderBy('tag.name', 'ASC')
      .getRawMany<{ id: number; name: string; postCount: string }>();

    // PostgreSQL returns COUNT as text, so convert it to a number
    return rows.map((r) => ({ ...r, postCount: Number(r.postCount) }));
  }
}
