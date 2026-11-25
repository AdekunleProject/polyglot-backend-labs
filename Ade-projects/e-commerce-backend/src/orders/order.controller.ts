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
import { AuditService } from '../audit/audit.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly audit: AuditService,
  ) {}

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
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
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
  @Roles(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN)
  async findOrder(@Param('orderId') orderId: string) {
    return this.ordersService.findOrder(orderId);
  }

  @Put(':orderId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  async update(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() actor: CurrentUserInterface,
  ) {
    const before = await this.ordersService.findOrder(orderId);
    const order = await this.ordersService.update(orderId, dto);
    await this.audit.record(actor.id, 'order.update', { type: 'order', id: orderId }, {
      fields: Object.keys(dto),
      ...(dto.status !== undefined ? { status: { from: before.status, to: dto.status } } : {}),
    });
    return order;
  }
}
