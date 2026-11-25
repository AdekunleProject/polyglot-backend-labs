import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';

import { VariantsService } from './product-variant.service';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Role } from 'src/common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { uploadOptions } from '../aws/aws.multer-uploads';
import { AuditService } from '../audit/audit.service';
import { idOf, pick } from '../audit/audit-details';
import { CurrentUser } from '../common/decorators/current-user.decorators';
import type { CurrentUserInterface } from '../common/interfaces/current-user.interface';

@Controller('variants')
export class VariantsController {
  constructor(
    private readonly variantsService: VariantsService,
    private readonly audit: AuditService,
  ) {}

  @Get('product/:productId')
  async findByProduct(@Param('productId') productId: string) {
    return this.variantsService.findByProduct(productId);
  }

  @Get(':varientId')
  async findOne(@Param('varientId') varientId: string) {
    return this.variantsService.findById(varientId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  @UseInterceptors(FilesInterceptor('images', 10, uploadOptions))
  async create(
    @Body() dto: CreateProductVariantDto,
    @CurrentUser() actor: CurrentUserInterface,
    @UploadedFiles()
    images?: Express.Multer.File[],
  ) {
    const variant = await this.variantsService.create(dto, images);
    await this.audit.record(actor.id, 'variant.create', { type: 'variant', id: idOf(variant) }, pick(variant, ['sku', 'price', 'stock']));
    return variant;
  }

  @Patch(':varientId/stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  async updateStock(
    @Param('varientId') varientId: string,
    @Body('stock') stock: number,
    @CurrentUser() actor: CurrentUserInterface,
  ) {
    const before = (await this.variantsService.findById(varientId)).stock;
    const variant = await this.variantsService.updateStock(varientId, stock);
    await this.audit.record(actor.id, 'variant.stock_update', { type: 'variant', id: varientId }, { from: before, to: stock });
    return variant;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() actor: CurrentUserInterface) {
    const result = await this.variantsService.remove(id);
    await this.audit.record(actor.id, 'variant.delete', { type: 'variant', id });
    return result;
  }
}
