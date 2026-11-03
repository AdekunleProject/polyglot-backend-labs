import { Post } from '../../posts/entities/post.entity';
import { User } from '../../users/entities/user.entity';
export declare class Comment {
    id: number;
    content: string;
    createdAt: Date;
    post: Post;
    author: User;
}
