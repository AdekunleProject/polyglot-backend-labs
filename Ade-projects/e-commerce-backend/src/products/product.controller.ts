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

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

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
  @Roles(Role.ADMIN)
  @UseInterceptors(FilesInterceptor('images', 10, uploadOptions))
  create(
    @Body() dto: CreateProductDto,
    @UploadedFiles()
    images?: Express.Multer.File[],
  ) {
    return this.productsService.create(dto, images);
  }

  @Put(':productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(@Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(productId, dto);
  }

  @Delete(':productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('productId') productId: string) {
    return this.productsService.remove(productId);
  }
}
