import { Comment } from '../../comments/entities/comment.entity';
import { Tag } from '../../tags/entities/tag.entity';
import { User } from '../../users/entities/user.entity';
export declare class Post {
    id: number;
    title: string;
    slug: string;
    content: string;
    published: boolean;
    createdAt: Date;
    updatedAt: Date;
    author: User;
    tags: Tag[];
    comments: Comment[];
}
