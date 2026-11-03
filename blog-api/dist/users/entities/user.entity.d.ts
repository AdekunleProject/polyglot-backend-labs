import { Comment } from '../../comments/entities/comment.entity';
import { Post } from '../../posts/entities/post.entity';
export declare class User {
    id: number;
    name: string;
    email: string;
    password: string;
    role: 'user' | 'admin';
    posts: Post[];
    comments: Comment[];
}
