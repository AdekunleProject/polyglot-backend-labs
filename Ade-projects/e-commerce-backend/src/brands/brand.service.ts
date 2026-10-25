import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import slugify from 'slugify';

import {
  Brand,
  // BrandDocument,
} from './schemas/brand.schema';

import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { FileUpload } from 'src/aws/aws.file-upload';

@Injectable()
export class BrandsService {
  constructor(
    @InjectModel(Brand.name)
    private readonly brandModel: Model<Brand>,
    private readonly fileUpload: FileUpload,
  ) {}

  async create(dto: CreateBrandDto, logo?: Express.Multer.File) {
    const slug = slugify(dto.name, {
      lower: true,
      strict: true,
    });

    const exists = await this.brandModel.findOne({
      slug,
    });

    if (exists) {
      throw new BadRequestException('Brand already exists.');
    }
    let logoUrl: string | undefined;
    if (logo) {
      logoUrl = await this.fileUpload.uploadFile(logo, 'brands');
    }
    return this.brandModel.create({
      ...dto,
      slug,
      logo: logoUrl,
    });
  }

  findAll() {
    return this.brandModel.find();
  }

  async findById(brandId: string) {
    const brand = await this.brandModel.findById(brandId);

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    return brand;
  }

  async update(brandId: string, dto: UpdateBrandDto) {
    let slug: string | undefined;
    if (dto.name) {
      slug = slugify(dto.name, {
        lower: true,
        strict: true,
      });

      const existing = await this.brandModel.findOne({
        slug,
        _id: { $ne: brandId },
      });

      if (existing) {
        throw new BadRequestException('Brand already exists.');
      }
    }
    const updateData = { ...dto, ...(slug && { slug }) };
    const brand = await this.brandModel.findByIdAndUpdate(brandId, updateData, {
      new: true,
    });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    return brand;
  }

  //DELETE USER
  async remove(brandId: string) {
    const deleted = await this.brandModel.findByIdAndDelete(brandId).exec();
    if (!deleted) throw new NotFoundException('Brand not found');

    return deleted;
  }
}
