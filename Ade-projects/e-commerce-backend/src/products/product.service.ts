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
import { SIGNATURE_LENGTH } from './dto/visual-search.dto';

export function dealEnd(days?: number, hours?: number): Date | null | undefined {
  if (days === undefined && hours === undefined) return undefined;
  const ms = ((days ?? 0) * 24 + (hours ?? 0)) * 3600 * 1000;
  return ms > 0 ? new Date(Date.now() + ms) : null;
}

export function parseSignature(raw?: string | number[]): number[] | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(value) && value.length === SIGNATURE_LENGTH && value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) {
      return value;
    }
  } catch {
    /* fall through */
  }
  throw new BadRequestException('Invalid visual signature.');
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
    private readonly fileUpload: FileUpload,
  ) {}

  async create(dto: CreateProductDto, images?: Express.Multer.File[], createdBy?: string) {
    if (dto.comparePrice && dto.comparePrice <= dto.price) {
      throw new BadRequestException('Original price must be higher than the selling price.');
    }
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
    const { visualSignature, dealDays, dealHours, ...rest } = dto;
    return this.productModel.create({
      ...rest,
      visualSignature: parseSignature(visualSignature),
      dealEndsAt: dealEnd(dealDays, dealHours) ?? null,
      createdBy,
      slug,
      sku: dto.sku.toUpperCase(),
      images: uploadedImages,
    });
  }

  async findAll(query: QueryProductDto, staff = false) {
    const filter: Record<string, unknown> = staff ? {} : { isActive: true };

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
      (staff ? this.productModel.find(filter).select('+createdBy').populate('createdBy', 'firstname lastname') : this.productModel.find(filter))
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
    if (update.price !== undefined || update.comparePrice !== undefined) {
      const current = await this.productModel.findById(productId).select('price comparePrice');
      const price = update.price ?? current?.price ?? 0;
      const compare = update.comparePrice ?? current?.comparePrice ?? 0;
      if (compare && compare <= price) {
        throw new BadRequestException('Original price must be higher than the selling price.');
      }
    }
    const { dealDays, dealHours, ...fields } = update;
    const data: Record<string, unknown> = { ...fields };
    const deal = dealEnd(dealDays, dealHours);
    if (deal !== undefined) data.dealEndsAt = deal;
    if (update.visualSignature !== undefined) {
      data.visualSignature = parseSignature(update.visualSignature);
    }
    const product = await this.productModel.findByIdAndUpdate(
      productId,
      data,
      { new: true },
    );
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return product;
  }

  async addImages(productId: string, images: Express.Multer.File[], signature?: string) {
    const product = await this.productModel.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    if (!images?.length) {
      throw new BadRequestException('Choose at least one image.');
    }
    if ((product.images?.length ?? 0) + images.length > 10) {
      throw new BadRequestException('A product can have at most 10 images.');
    }
    const uploaded: string[] = [];
    for (const image of images) {
      uploaded.push(await this.fileUpload.uploadFile(image, 'products'));
    }
    const hadImages = (product.images?.length ?? 0) > 0;
    product.images = [...(product.images ?? []), ...uploaded];
    const parsed = parseSignature(signature);
    if (parsed && !hadImages) product.visualSignature = parsed;
    await product.save();
    return product;
  }

  async removeImage(productId: string, url: string) {
    if (!url) {
      throw new BadRequestException('Image url is required.');
    }
    const product = await this.productModel.findByIdAndUpdate(
      productId,
      { $pull: { images: url } },
      { returnDocument: 'after' },
    );
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return product;
  }

  async visualSearch(signature: number[], limit = 12) {
    const candidates = await this.productModel
      .find({ isActive: true, visualSignature: { $exists: true, $ne: [] } })
      .select('+visualSignature')
      .populate('category')
      .populate('brand')
      .lean();
    const maxDistance = Math.sqrt(SIGNATURE_LENGTH);
    return candidates
      .map((product) => {
        const other = (product.visualSignature ?? []) as number[];
        let sum = 0;
        for (let i = 0; i < SIGNATURE_LENGTH; i++) sum += ((signature[i] ?? 0) - (other[i] ?? 0)) ** 2;
        const { visualSignature, ...rest } = product;
        void visualSignature;
        return { ...rest, similarity: Math.max(0, Math.round((1 - Math.sqrt(sum) / maxDistance) * 100)) };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
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
