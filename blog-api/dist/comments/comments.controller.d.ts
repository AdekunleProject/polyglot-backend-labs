import type { AuthUser } from '../auth/auth-user.type';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
export declare class CommentsController {
    private readonly commentsService;
    constructor(commentsService: CommentsService);
    create(postId: number, dto: CreateCommentDto, user: AuthUser): Promise<import("./entities/comment.entity").Comment>;
    findForPost(postId: number, page?: string, limit?: string): Promise<{
        items: import("./entities/comment.entity").Comment[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    remove(id: number, user: AuthUser): Promise<{
        deleted: boolean;
    }>;
}
