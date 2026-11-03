import { PostsService } from './posts.service';
export declare class TagsController {
    private readonly postsService;
    constructor(postsService: PostsService);
    findAll(): Promise<{
        postCount: number;
        id: number;
        name: string;
    }[]>;
}
