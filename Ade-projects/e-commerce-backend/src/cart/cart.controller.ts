import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorators';

import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/cart-item.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Role } from 'src/common/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import type { CurrentUserInterface } from 'src/common/interfaces/current-user.interface';

@Controller('cart')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@CurrentUser() user: CurrentUserInterface) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  async addItem(
    @CurrentUser() user: CurrentUserInterface,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.addItem(user.id, dto.variantId, dto.quantity);
  }

  @Delete('items/:variantId')
  async removeItem(
    @CurrentUser() user: CurrentUserInterface,
    @Param('variantId') variantId: string,
  ) {
    return this.cartService.removeItem(user.id, variantId);
  }

  @Delete()
  async clearCart(@CurrentUser() user: CurrentUserInterface) {
    return this.cartService.clearCart(user.id);
  }
}
