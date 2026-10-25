import {
  Controller,
  Get,
  UseGuards,
  Post,
  Put,
  Body,
  Delete,
  Req,
  Res,
  Param,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Patch,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorators';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { AnalyticsService } from './analytics.service';

import type { CurrentUserInterface } from '../common/interfaces/current-user.interface';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminDashboard(@CurrentUser() user: CurrentUserInterface) {
    return this.analyticsService.getAdminDashboard(user.id);
  }

  @Get('customer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  async getCustomerDashboard(@CurrentUser() user: CurrentUserInterface) {
    return this.analyticsService.getCustomerDashboard(user.id);
  }

  @Get('orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getOrdersDashboard(@CurrentUser() user: CurrentUserInterface) {
    return this.analyticsService.getOrdersDashboard();
  }

  // BUG FIX: this and getProductListDashboard() below were both mapped to
  // the identical route @Get('products') — only whichever handler NestJS
  // registers first actually responds to a request; the other is silently
  // unreachable. Split into two distinct paths instead. `/products` stays
  // as-is (the lighter category/brand/product/variant counts, useful on
  // an "Add Product" screen) and the richer inventory breakdown moves to
  // `/products/inventory`.
  @Get('products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getAddProductDashboard() {
    return this.analyticsService.getAddProductDashboard();
  }

  @Get('products/inventory')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getProductListDashboard() {
    return this.analyticsService.getProductListDashboard();
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getTransactionsDashboard() {
    return this.analyticsService.getTransactionsDashboard();
  }
}
