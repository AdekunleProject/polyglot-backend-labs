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

@Controller('variants')
export class VariantsController {
  constructor(private readonly variantsService: VariantsService) {}

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
  @Roles(Role.ADMIN)
  @UseInterceptors(FilesInterceptor('images', 10, uploadOptions))
  create(
    @Body() dto: CreateProductVariantDto,
    @UploadedFiles()
    images?: Express.Multer.File[],
  ) {
    return this.variantsService.create(dto, images);
  }

  @Patch(':varientId/stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateStock(
    @Param('varientId') varientId: string,
    @Body('stock') stock: number,
  ) {
    return this.variantsService.updateStock(varientId, stock);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.variantsService.remove(id);
  }
}
