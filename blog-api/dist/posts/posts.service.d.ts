import { Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type';
import { Tag } from '../tags/entities/tag.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { FindPostsQueryDto } from './dto/find-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { Post } from './entities/post.entity';
export declare class PostsService {
    private readonly postsRepository;
    private readonly tagsRepository;
    constructor(postsRepository: Repository<Post>, tagsRepository: Repository<Tag>);
    private resolveTags;
    create(dto: CreatePostDto, user: AuthUser): Promise<Post>;
    findAll(query: FindPostsQueryDto): Promise<{
        items: Post[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    mine(user: AuthUser): Promise<Post[]>;
    findBySlug(slug: string): Promise<Post>;
    private findOwned;
    update(id: number, dto: UpdatePostDto, user: AuthUser): Promise<Post>;
    remove(id: number, user: AuthUser): Promise<{
        deleted: boolean;
    }>;
    tagsWithCounts(): Promise<{
        postCount: number;
        id: number;
        name: string;
    }[]>;
}
