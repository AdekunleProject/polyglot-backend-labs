import { Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type';
import { Post } from '../posts/entities/post.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Comment } from './entities/comment.entity';
export declare class CommentsService {
    private readonly commentsRepository;
    private readonly postsRepository;
    constructor(commentsRepository: Repository<Comment>, postsRepository: Repository<Post>);
    private requirePublishedPost;
    create(postId: number, dto: CreateCommentDto, user: AuthUser): Promise<Comment>;
    findForPost(postId: number, page?: number, limit?: number): Promise<{
        items: Comment[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    remove(commentId: number, user: AuthUser): Promise<{
        deleted: boolean;
    }>;
}
