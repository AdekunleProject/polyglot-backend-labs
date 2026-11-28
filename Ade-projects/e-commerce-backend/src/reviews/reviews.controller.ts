import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { ReviewsService } from './reviews.service';
import { CreateReviewDto, QueryReviewsDto, ReplyDto, UpdateReviewDto } from './dto/review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorators';
import type { CurrentUserInterface } from '../common/interfaces/current-user.interface';
import { AuditService } from '../audit/audit.service';

@Controller()
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly audit: AuditService,
  ) {}

  @Get('products/:productId/reviews')
  listForProduct(@Param('productId') productId: string, @Query() query: QueryReviewsDto) {
    return this.reviews.listForProduct(productId, query);
  }

  @Post('products/:productId/reviews')
  @UseGuards(JwtAuthGuard)
  create(@Param('productId') productId: string, @Body() dto: CreateReviewDto, @CurrentUser() actor: CurrentUserInterface) {
    return this.reviews.create(productId, dto, actor);
  }

  @Get('reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  listAll(@Query() query: QueryReviewsDto) {
    return this.reviews.listAll(query);
  }

  @Put('reviews/:id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateReviewDto, @CurrentUser() actor: CurrentUserInterface) {
    const review = await this.reviews.update(id, dto, actor);
    if (actor.role !== Role.CUSTOMER) await this.audit.record(actor.id, 'review.update', { type: 'review', id }, { fields: Object.keys(dto) });
    return review;
  }

  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @CurrentUser() actor: CurrentUserInterface) {
    const result = await this.reviews.remove(id, actor);
    if (actor.role !== Role.CUSTOMER) await this.audit.record(actor.id, 'review.delete', { type: 'review', id });
    return result;
  }

  @Post('reviews/:id/replies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  async reply(@Param('id') id: string, @Body() dto: ReplyDto, @CurrentUser() actor: CurrentUserInterface) {
    const review = await this.reviews.reply(id, dto.text, actor);
    await this.audit.record(actor.id, 'review.reply', { type: 'review', id });
    return review;
  }

  @Delete('reviews/:id/replies/:replyId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  async removeReply(@Param('id') id: string, @Param('replyId') replyId: string, @CurrentUser() actor: CurrentUserInterface) {
    const review = await this.reviews.removeReply(id, replyId);
    await this.audit.record(actor.id, 'review.reply.delete', { type: 'review', id });
    return review;
  }
}
