import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user.type';
import { Comment } from '../comments/entities/comment.entity';
import { Post } from '../posts/entities/post.entity';
import { UsersService } from './users.service';

/**
 * Lets a superadmin see everything one account wrote, drafts included. Every
 * look is recorded in the audit log, because drafts are private.
 */
@Injectable()
export class UserContentService {
  constructor(
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  async postsOf(actor: AuthUser, userId: number, page: number, limit: number) {
    const target = await this.users.requireManageable(actor, userId);
    const [items, total] = await this.posts.findAndCount({
      where: { author: { id: target.id } },
      relations: { tags: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    await this.audit.record(actor.id, 'user.view_posts', target.id, { page });
    return { items, total, page, limit };
  }

  async commentsOf(actor: AuthUser, userId: number, page: number, limit: number) {
    const target = await this.users.requireManageable(actor, userId);
    const [rows, total] = await this.comments.findAndCount({
      where: { author: { id: target.id } },
      relations: { post: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    await this.audit.record(actor.id, 'user.view_comments', target.id, { page });
    return {
      items: rows.map((comment) => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        post: {
          id: comment.post.id,
          title: comment.post.title,
          slug: comment.post.slug,
          published: comment.post.published,
        },
      })),
      total,
      page,
      limit,
    };
  }
}
