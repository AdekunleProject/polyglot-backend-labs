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
  Patch,
} from '@nestjs/common';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './order.service';
import type { CurrentUserInterface } from '../common/interfaces/current-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorators';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  async create(
    @CurrentUser() user: CurrentUserInterface,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.ordersService.create(user.id, createOrderDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findAll() {
    return this.ordersService.findAll();
  }

  @Get('my-orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  async getMyOrders(@CurrentUser() user: CurrentUserInterface) {
    return this.ordersService.getMyOrders(user.id);
  }

  @Get('my-orders/:orderId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  async findMyOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: CurrentUserInterface,
  ) {
    return this.ordersService.findMyOrder(orderId, user.id);
  }

  @Get(':orderId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findOrder(@Param('orderId') orderId: string) {
    return this.ordersService.findOrder(orderId);
  }

  @Put(':orderId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(@Param('orderId') orderId: string, @Body() dto: UpdateOrderDto) {
    return this.ordersService.update(orderId, dto);
  }
}
