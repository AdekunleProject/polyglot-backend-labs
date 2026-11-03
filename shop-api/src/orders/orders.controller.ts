import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    return this.ordersService.create(dto, user);
  }

  // demo only: the buggy version, to reproduce the race. Remove before real use.
  @Post('naive')
  createNaive(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    return this.ordersService.createNaive(dto, user);
  }
}
