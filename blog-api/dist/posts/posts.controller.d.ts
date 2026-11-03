import type { AuthUser } from '../auth/auth-user.type';
import { CreatePostDto } from './dto/create-post.dto';
import { FindPostsQueryDto } from './dto/find-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';
export declare class PostsController {
    private readonly postsService;
    constructor(postsService: PostsService);
    findAll(query: FindPostsQueryDto): Promise<{
        items: import("./entities/post.entity").Post[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    mine(user: AuthUser): Promise<import("./entities/post.entity").Post[]>;
    findOne(slug: string): Promise<import("./entities/post.entity").Post>;
    create(dto: CreatePostDto, user: AuthUser): Promise<import("./entities/post.entity").Post>;
    update(id: number, dto: UpdatePostDto, user: AuthUser): Promise<import("./entities/post.entity").Post>;
    remove(id: number, user: AuthUser): Promise<{
        deleted: boolean;
    }>;
}
