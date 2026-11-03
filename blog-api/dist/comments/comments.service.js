"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const post_entity_1 = require("../posts/entities/post.entity");
const comment_entity_1 = require("./entities/comment.entity");
let CommentsService = class CommentsService {
    commentsRepository;
    postsRepository;
    constructor(commentsRepository, postsRepository) {
        this.commentsRepository = commentsRepository;
        this.postsRepository = postsRepository;
    }
    async requirePublishedPost(postId) {
        const post = await this.postsRepository.findOneBy({
            id: postId,
            published: true,
        });
        if (!post)
            throw new common_1.NotFoundException(`Post ${postId} not found`);
        return post;
    }
    async create(postId, dto, user) {
        await this.requirePublishedPost(postId);
        const comment = this.commentsRepository.create({
            content: dto.content,
            post: { id: postId },
            author: { id: user.id },
        });
        return this.commentsRepository.save(comment);
    }
    async findForPost(postId, page = 1, limit = 10) {
        await this.requirePublishedPost(postId);
        const [items, total] = await this.commentsRepository
            .createQueryBuilder('comment')
            .leftJoin('comment.author', 'author')
            .addSelect(['author.id', 'author.name'])
            .where('comment.postId = :postId', { postId })
            .orderBy('comment.createdAt', 'ASC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
    async remove(commentId, user) {
        const comment = await this.commentsRepository.findOne({
            where: { id: commentId },
            relations: { author: true, post: { author: true } },
        });
        if (!comment)
            throw new common_1.NotFoundException(`Comment ${commentId} not found`);
        const allowed = user.role === 'admin' ||
            comment.author.id === user.id ||
            comment.post.author.id === user.id;
        if (!allowed)
            throw new common_1.ForbiddenException('You cannot delete this comment');
        await this.commentsRepository.delete(commentId);
        return { deleted: true };
    }
};
exports.CommentsService = CommentsService;
exports.CommentsService = CommentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(comment_entity_1.Comment)),
    __param(1, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], CommentsService);
//# sourceMappingURL=comments.service.js.map