import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Put,
  Delete,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';

import { BrandsService } from './brand.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { uploadOptions } from 'src/aws/aws.multer-uploads';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller({
  path: 'brands',
  version: '1',
})
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  findAll() {
    return this.brandsService.findAll();
  }

  @Get('/:brandId')
  findById(@Param('brandId') brandId: string) {
    return this.brandsService.findById(brandId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('logo', uploadOptions))
  create(
    @Body() dto: CreateBrandDto,
    @UploadedFile() logo?: Express.Multer.File,
  ) {
    return this.brandsService.create(dto, logo);
  }

  @Put('/:brandId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(@Param('brandId') brandId: string, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(brandId, dto);
  }

  @Delete(':brandId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('brandId') brandId: string) {
    return this.brandsService.remove(brandId);
  }
}
