import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import slugify from 'slugify';

import { Product } from './schemas/product.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import {
  getPagination,
  getPaginationMeta,
} from '../common/utils/pagination.utils';
import { UpdateProductDto } from './dto/update-product.dto';
import { FileUpload } from 'src/aws/aws.file-upload';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
    private readonly fileUpload: FileUpload,
  ) {}

  async create(dto: CreateProductDto, images?: Express.Multer.File[]) {
    const slug = slugify(dto.name, {
      lower: true,
      strict: true,
    });

    const exists = await this.productModel.findOne({
      $or: [{ slug }, { sku: dto.sku.toUpperCase() }],
    });

    if (exists) {
      throw new BadRequestException('Product already exists.');
    }
    const uploadedImages: string[] = [];
    if (images?.length) {
      for (const image of images) {
        uploadedImages.push(
          await this.fileUpload.uploadFile(image, 'products'),
        );
      }
    }
    return this.productModel.create({
      ...dto,
      slug,
      sku: dto.sku.toUpperCase(),
      images: uploadedImages,
    });
  }

  async findAll(query: QueryProductDto) {
    const filter: Record<string, unknown> = {
      isActive: true,
    };

    if (query.search) {
      filter.name = {
        $regex: query.search,
        $options: 'i',
      };
    }

    if (query.category) {
      filter.category = query.category;
    }

    if (query.brand) {
      filter.brand = query.brand;
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter.price = {};

      if (query.minPrice !== undefined) {
        (filter.price as Record<string, number>).$gte = query.minPrice;
      }

      if (query.maxPrice !== undefined) {
        (filter.price as Record<string, number>).$lte = query.maxPrice;
      }
    }

    if (query.featured !== undefined) {
      filter.featured = query.featured;
    }

    const { skip, limit } = getPagination(query.page, query.limit);

    const [products, total] = await Promise.all([
      this.productModel
        .find(filter)
        .populate('category')
        .populate('brand')
        .skip(skip)
        .limit(limit)
        .sort({
          [query.sortBy]: query.sortOrder === 'asc' ? 1 : -1,
        }),
      this.productModel.countDocuments(filter),
    ]);

    return {
      data: products,
      meta: getPaginationMeta(total, query.page, query.limit),
    };
  }

  async findById(productId: string) {
    const product = await this.productModel
      .findById(productId)
      .populate('category')
      .populate('brand');

    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return product;
  }

  async update(productId: string, update: UpdateProductDto) {
    if (update.name) {
      update.slug = slugify(update.name, {
        lower: true,
        strict: true,
      });
    }
    if (update.sku) {
      update.sku = update.sku.toUpperCase();
    }
    const exists = await this.productModel.findOne({
      _id: { $ne: productId },
      $or: [
        ...(update.slug ? [{ slug: update.slug }] : []),
        ...(update.sku ? [{ sku: update.sku }] : []),
      ],
    });
    if (exists) {
      throw new BadRequestException('Product already exists.');
    }
    const product = await this.productModel.findByIdAndUpdate(
      productId,
      update,
      { new: true },
    );
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return product;
  }

  async remove(productId: string) {
    const product = await this.productModel.findById(productId);

    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    product.isActive = false;
    await product.save();
    return {
      message: 'Product deleted successfully.',
    };
  }
}
