import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import slugify from 'slugify';

import { Category } from './schemas/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<Category>,
  ) {}

  async create(dto: CreateCategoryDto) {
    const slug = slugify(dto.name, {
      lower: true,
      strict: true,
    });
    const exists = await this.categoryModel.findOne({
      slug,
    });
    if (exists) {
      throw new BadRequestException('Category already exists.');
    }
    return this.categoryModel.create({
      ...dto,
      slug,
    });
  }

  findAll() {
    return this.categoryModel.find();
  }

  async findById(categoryId) {
    const category = await this.categoryModel.findById(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    return category;
  }

  async update(categoryId: string, update: UpdateCategoryDto) {
    const updateData: Partial<Category> = {
      ...update,
    };
    if (update.name) {
      updateData.slug = slugify(update.name, {
        lower: true,
        strict: true,
      });
      const exists = await this.categoryModel.findOne({
        slug: updateData.slug,
        _id: { $ne: categoryId },
      });
      if (exists) {
        throw new BadRequestException('Category already exists.');
      }
    }
    const category = await this.categoryModel.findByIdAndUpdate(
      categoryId,
      updateData,
      { new: true },
    );
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    return category;
  }

  async remove(categoryId: string) {
    const category = await this.categoryModel
      .findByIdAndDelete(categoryId)
      .exec();
    if (!category) throw new NotFoundException('Not found');
    return category;
  }
}
