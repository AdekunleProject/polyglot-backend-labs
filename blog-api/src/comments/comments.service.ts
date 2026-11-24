import { Role } from '../common/enums/role.enum';
import { isAtLeast } from '../common/role-policy';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
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
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
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
    const post = await this.requirePublishedPost(postId);
    const comment = this.commentsRepository.create({
      content: dto.content,
      post: { id: postId },
      author: { id: user.id },
    });
    const saved = await this.commentsRepository.save(comment);
    // Tell the post's author, unless they commented on their own post.
    const authorId = (await this.postsRepository.findOne({
      where: { id: postId },
      relations: { author: true },
    }))?.author.id;
    if (authorId && authorId !== user.id) {
      await this.notifications.notify(authorId, 'comment', 'New comment on your post', dto.content, {
        postId,
        slug: post.slug,
        commentId: saved.id,
      });
    }
    return saved;
  }

  async findForPost(postId: number, page = 1, limit = 10) {
    await this.requirePublishedPost(postId);
    const [items, total] = await this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoin('comment.author', 'author')
      .addSelect(['author.id', 'author.firstname', 'author.lastname'])
      .where('comment.postId = :postId', { postId })
      .orderBy('comment.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async remove(commentId: number, user: AuthUser, reason?: string) {
    const comment = await this.commentsRepository.findOne({
      where: { id: commentId },
      relations: { author: true, post: { author: true } },
    });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);

    const allowed =
      isAtLeast(user.role, Role.ADMIN) ||
      comment.author.id === user.id ||
      comment.post.author.id === user.id;
    if (!allowed)
      throw new ForbiddenException('You cannot delete this comment');

    // Staff removing someone else's comment is moderation: a reason, and a record.
    const moderating =
      isAtLeast(user.role, Role.ADMIN) && comment.author.id !== user.id;
    if (moderating && !reason) {
      throw new BadRequestException('A reason is required to remove someone else\'s comment');
    }

    await this.commentsRepository.delete(commentId);
    if (moderating) {
      await this.audit.record(user.id, 'comment.remove', comment.author.id, {
        commentId,
        postId: comment.post.id,
        reason,
      });
    }
    return { deleted: true };
  }
}
