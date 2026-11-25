import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Put,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ProductsService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';

import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { uploadOptions } from '../aws/aws.multer-uploads';
import { AuditService } from '../audit/audit.service';
import { idOf, pick } from '../audit/audit-details';
import { CurrentUser } from '../common/decorators/current-user.decorators';
import type { CurrentUserInterface } from '../common/interfaces/current-user.interface';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  findAll(@Query() query: QueryProductDto) {
    return this.productsService.findAll(query);
  }

  // CRITICAL BUG FIX: this route was declared as @Get(':id') but the
  // handler read @Param('productId') — since those names didn't match,
  // Nest's @Param() extraction always returned undefined, so
  // findById(undefined) ran on every single request to this route. Every
  // "view product" request was broken. Renamed the route param to match
  // what the handler actually reads (and what the rest of this
  // controller's :productId routes already use).
  @Get(':productId')
  findOne(@Param('productId') productId: string) {
    return this.productsService.findById(productId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  @UseInterceptors(FilesInterceptor('images', 10, uploadOptions))
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() actor: CurrentUserInterface,
    @UploadedFiles()
    images?: Express.Multer.File[],
  ) {
    const product = await this.productsService.create(dto, images);
    await this.audit.record(actor.id, 'product.create', { type: 'product', id: idOf(product) }, pick(product, ['name', 'sku']));
    return product;
  }

  @Put(':productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  async update(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() actor: CurrentUserInterface,
  ) {
    const before = await this.productsService.findById(productId);
    const product = await this.productsService.update(productId, dto);
    const fields = Object.keys(dto);
    const changes = Object.fromEntries(
      fields.map((field) => [field, { from: (before as unknown as Record<string, unknown>)[field], to: (product as unknown as Record<string, unknown>)[field] }]),
    );
    await this.audit.record(actor.id, 'product.update', { type: 'product', id: productId }, { fields, changes });
    return product;
  }

  @Delete(':productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  async remove(@Param('productId') productId: string, @CurrentUser() actor: CurrentUserInterface) {
    const result = await this.productsService.remove(productId);
    await this.audit.record(actor.id, 'product.delete', { type: 'product', id: productId });
    return result;
  }
}
