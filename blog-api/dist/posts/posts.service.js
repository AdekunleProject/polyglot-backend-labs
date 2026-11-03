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
exports.PostsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const tag_entity_1 = require("../tags/entities/tag.entity");
const post_entity_1 = require("./entities/post.entity");
const slugify = (text) => text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
let PostsService = class PostsService {
    postsRepository;
    tagsRepository;
    constructor(postsRepository, tagsRepository) {
        this.postsRepository = postsRepository;
        this.tagsRepository = tagsRepository;
    }
    async resolveTags(names = []) {
        const clean = [...new Set(names.map((n) => n.trim().toLowerCase()))].filter(Boolean);
        if (clean.length === 0)
            return [];
        const existing = await this.tagsRepository.findBy({ name: (0, typeorm_2.In)(clean) });
        const known = new Set(existing.map((t) => t.name));
        const created = await this.tagsRepository.save(clean.filter((n) => !known.has(n)).map((name) => ({ name })));
        return [...existing, ...created];
    }
    async create(dto, user) {
        const slug = `${slugify(dto.title)}-${Date.now().toString(36)}`;
        const post = this.postsRepository.create({
            title: dto.title,
            content: dto.content,
            published: dto.published ?? false,
            slug,
            author: { id: user.id },
            tags: await this.resolveTags(dto.tags),
        });
        return this.postsRepository.save(post);
    }
    async findAll(query) {
        const qb = this.postsRepository
            .createQueryBuilder('post')
            .leftJoin('post.author', 'author')
            .addSelect(['author.id', 'author.name'])
            .leftJoinAndSelect('post.tags', 'tag')
            .where('post.published = true');
        if (query.tag) {
            qb.innerJoin('post.tags', 'filterTag', 'filterTag.name = :tag', {
                tag: query.tag.toLowerCase(),
            });
        }
        if (query.search) {
            qb.andWhere('post.title ILIKE :search', { search: `%${query.search}%` });
        }
        const [items, total] = await qb
            .orderBy('post.createdAt', 'DESC')
            .skip((query.page - 1) * query.limit)
            .take(query.limit)
            .getManyAndCount();
        return {
            items,
            total,
            page: query.page,
            limit: query.limit,
            totalPages: Math.ceil(total / query.limit),
        };
    }
    mine(user) {
        return this.postsRepository.find({
            where: { author: { id: user.id } },
            relations: { tags: true },
            order: { createdAt: 'DESC' },
        });
    }
    async findBySlug(slug) {
        const post = await this.postsRepository
            .createQueryBuilder('post')
            .leftJoin('post.author', 'author')
            .addSelect(['author.id', 'author.name'])
            .leftJoinAndSelect('post.tags', 'tag')
            .where('post.slug = :slug AND post.published = true', { slug })
            .getOne();
        if (!post)
            throw new common_1.NotFoundException(`Post "${slug}" not found`);
        return post;
    }
    async findOwned(id, user) {
        const post = await this.postsRepository.findOne({
            where: { id },
            relations: { author: true, tags: true },
        });
        if (!post)
            throw new common_1.NotFoundException(`Post ${id} not found`);
        if (user.role !== 'admin' && post.author.id !== user.id) {
            throw new common_1.ForbiddenException('You can only change your own posts');
        }
        return post;
    }
    async update(id, dto, user) {
        const post = await this.findOwned(id, user);
        if (dto.title !== undefined)
            post.title = dto.title;
        if (dto.content !== undefined)
            post.content = dto.content;
        if (dto.published !== undefined)
            post.published = dto.published;
        if (dto.tags !== undefined)
            post.tags = await this.resolveTags(dto.tags);
        return this.postsRepository.save(post);
    }
    async remove(id, user) {
        await this.findOwned(id, user);
        await this.postsRepository.delete(id);
        return { deleted: true };
    }
    async tagsWithCounts() {
        const rows = await this.tagsRepository
            .createQueryBuilder('tag')
            .leftJoin('tag.posts', 'post')
            .select('tag.id', 'id')
            .addSelect('tag.name', 'name')
            .addSelect('COUNT(post.id)', 'postCount')
            .groupBy('tag.id')
            .orderBy('tag.name', 'ASC')
            .getRawMany();
        return rows.map((r) => ({ ...r, postCount: Number(r.postCount) }));
    }
};
exports.PostsService = PostsService;
exports.PostsService = PostsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __param(1, (0, typeorm_1.InjectRepository)(tag_entity_1.Tag)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], PostsService);
//# sourceMappingURL=posts.service.js.map