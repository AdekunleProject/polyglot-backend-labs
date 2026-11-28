import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Review } from './schemas/review.schema';
import { Product } from '../products/schemas/product.schema';
import { User } from '../users/schemas/user.schema';
import { Role } from '../common/enums/role.enum';
import { NotificationsService } from '../notifications/notification.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { getPagination, getPaginationMeta } from '../common/utils/pagination.utils';
import type { CurrentUserInterface } from '../common/interfaces/current-user.interface';
import type { CreateReviewDto, QueryReviewsDto, UpdateReviewDto } from './dto/review.dto';

const STAFF = new Set<string>([Role.MANAGER, Role.ADMIN, Role.SUPERADMIN]);
export const isStaff = (role: string) => STAFF.has(role);

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly notifications: NotificationsService,
  ) {}

  private async nameOf(userId: string) {
    const user = await this.userModel.findById(userId).select('firstname lastname');
    if (!user) throw new NotFoundException('User not found.');
    return `${user.firstname} ${user.lastname}`.trim();
  }

  private async refreshProduct(productId: Types.ObjectId | string) {
    const [stats] = await this.reviewModel.aggregate<{ average: number; count: number }>([
      { $match: { product: new Types.ObjectId(String(productId)) } },
      { $group: { _id: '$product', average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await this.productModel.findByIdAndUpdate(productId, {
      ratingAverage: stats ? Math.round(stats.average * 10) / 10 : 0,
      ratingCount: stats?.count ?? 0,
    });
  }

  private async summary(productId: string) {
    const rows = await this.reviewModel.aggregate<{ _id: number; n: number }>([
      { $match: { product: new Types.ObjectId(productId) } },
      { $group: { _id: '$rating', n: { $sum: 1 } } },
    ]);
    const breakdown: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let count = 0;
    let total = 0;
    for (const row of rows) {
      breakdown[String(row._id)] = row.n;
      count += row.n;
      total += row._id * row.n;
    }
    return { average: count ? Math.round((total / count) * 10) / 10 : 0, count, breakdown };
  }

  async listForProduct(productId: string, query: QueryReviewsDto) {
    if (!Types.ObjectId.isValid(productId)) throw new NotFoundException('Product not found.');
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const { skip } = getPagination(page, limit);
    const filter: Record<string, unknown> = { product: new Types.ObjectId(productId) };
    if (query.rating) filter.rating = query.rating;
    const [data, total, summary] = await Promise.all([
      this.reviewModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.reviewModel.countDocuments(filter),
      this.summary(productId),
    ]);
    return { data, meta: getPaginationMeta(total, page, limit), summary };
  }

  async listAll(query: QueryReviewsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { skip } = getPagination(page, limit);
    const filter: Record<string, unknown> = {};
    if (query.rating) filter.rating = query.rating;
    const [data, total] = await Promise.all([
      this.reviewModel.find(filter).populate('product', 'name images').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.reviewModel.countDocuments(filter),
    ]);
    return { data, meta: getPaginationMeta(total, page, limit) };
  }

  async create(productId: string, dto: CreateReviewDto, actor: CurrentUserInterface) {
    const product = await this.productModel.findById(productId).select('name isActive');
    if (!product || !product.isActive) throw new NotFoundException('Product not found.');
    const exists = await this.reviewModel.exists({ product: product._id, user: actor.id });
    if (exists) throw new BadRequestException('You have already reviewed this product. Edit your review instead.');
    const authorName = await this.nameOf(actor.id);
    const review = await this.reviewModel.create({
      product: product._id,
      user: actor.id,
      authorName,
      authorRole: actor.role,
      rating: dto.rating,
      comment: dto.comment?.trim() ?? '',
    });
    await this.refreshProduct(product._id);
    await this.notifications.notifyAdmins(
      NotificationType.NEW_REVIEW,
      `New ${dto.rating}-star review`,
      `${authorName} rated "${product.name}" ${dto.rating}/5${dto.comment ? `: ${dto.comment.trim().slice(0, 120)}` : '.'}`,
      '/admin/feedback',
      actor.id,
      [Role.MANAGER, Role.ADMIN],
    );
    return review;
  }

  private async mustFind(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Review not found.');
    const review = await this.reviewModel.findById(id);
    if (!review) throw new NotFoundException('Review not found.');
    return review;
  }

  async update(id: string, dto: UpdateReviewDto, actor: CurrentUserInterface) {
    const review = await this.mustFind(id);
    if (String(review.user) !== actor.id && !isStaff(actor.role)) throw new ForbiddenException('You can only edit your own review.');
    if (dto.rating === undefined && dto.comment === undefined) throw new BadRequestException('Nothing to update.');
    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.comment !== undefined) review.comment = dto.comment.trim();
    review.edited = true;
    await review.save();
    await this.refreshProduct(review.product);
    return review;
  }

  async remove(id: string, actor: CurrentUserInterface) {
    const review = await this.mustFind(id);
    if (String(review.user) !== actor.id && !isStaff(actor.role)) throw new ForbiddenException('You can only delete your own review.');
    await review.deleteOne();
    await this.refreshProduct(review.product);
    return { message: 'Review deleted.', productId: String(review.product) };
  }

  async reply(id: string, text: string, actor: CurrentUserInterface) {
    const review = await this.mustFind(id);
    const authorName = await this.nameOf(actor.id);
    review.replies.push({ user: new Types.ObjectId(actor.id), authorName, authorRole: actor.role, text: text.trim() } as never);
    await review.save();
    if (String(review.user) !== actor.id) {
      await this.notifications.notifyUser(
        review.user,
        NotificationType.REVIEW_REPLY,
        'The store replied to your review',
        text.trim().slice(0, 140),
        `/product/${String(review.product)}`,
      );
    }
    return review;
  }

  async removeReply(id: string, replyId: string) {
    const review = await this.mustFind(id);
    const before = review.replies.length;
    review.replies = review.replies.filter((r) => String(r._id) !== replyId);
    if (review.replies.length === before) throw new NotFoundException('Reply not found.');
    await review.save();
    return review;
  }
}
