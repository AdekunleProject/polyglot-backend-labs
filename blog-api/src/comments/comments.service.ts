import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type';
import { Post } from '../posts/entities/post.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Comment } from './entities/comment.entity';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
  ) {}

  private async requirePublishedPost(postId: number) {
    const post = await this.postsRepository.findOneBy({
      id: postId,
      published: true,
    });
    if (!post) throw new NotFoundException(`Post ${postId} not found`);
    return post;
  }

  async create(postId: number, dto: CreateCommentDto, user: AuthUser) {
    await this.requirePublishedPost(postId);
    const comment = this.commentsRepository.create({
      content: dto.content,
      post: { id: postId },
      author: { id: user.id },
    });
    return this.commentsRepository.save(comment);
  }

  async findForPost(postId: number, page = 1, limit = 10) {
    await this.requirePublishedPost(postId);
    const [items, total] = await this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoin('comment.author', 'author')
      .addSelect(['author.id', 'author.name'])
      .where('comment.postId = :postId', { postId })
      .orderBy('comment.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async remove(commentId: number, user: AuthUser) {
    const comment = await this.commentsRepository.findOne({
      where: { id: commentId },
      relations: { author: true, post: { author: true } },
    });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);

    const allowed =
      user.role === 'admin' ||
      comment.author.id === user.id ||
      comment.post.author.id === user.id;
    if (!allowed)
      throw new ForbiddenException('You cannot delete this comment');

    await this.commentsRepository.delete(commentId);
    return { deleted: true };
  }
}
