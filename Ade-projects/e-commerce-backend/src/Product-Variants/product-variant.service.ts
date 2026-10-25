import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProductVariant } from './schemas/product-variant.schema';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { FileUpload } from 'src/aws/aws.file-upload';

@Injectable()
export class VariantsService {
  constructor(
    @InjectModel(ProductVariant.name)
    private readonly variantModel: Model<ProductVariant>,
    private readonly fileUpload: FileUpload,
  ) {}

  async create(dto: CreateProductVariantDto, images?: Express.Multer.File[]) {
    const exists = await this.variantModel.findOne({
      sku: dto.sku.toUpperCase(),
    });
    if (exists) {
      throw new BadRequestException('Variant SKU already exists.');
    }
    const uploadedImages: string[] = [];
    if (images?.length) {
      for (const image of images) {
        uploadedImages.push(
          await this.fileUpload.uploadFile(image, 'variants'),
        );
      }
    }
    return this.variantModel.create({
      images: uploadedImages,
      ...dto,
      sku: dto.sku.toUpperCase(),
    });
  }

  findByProduct(productId: string) {
    return this.variantModel.find({
      product: productId,
      isActive: true,
    });
  }

  async findById(varientId: string) {
    const variant = await this.variantModel.findById(varientId);

    if (!variant) {
      throw new NotFoundException('Variant not found.');
    }

    return variant;
  }

  async updateStock(varientId: string, stock: number) {
    const variant = await this.findById(varientId);

    variant.stock = stock;

    await variant.save();

    return variant;
  }

  async remove(id: string) {
    const variant = await this.findById(id);

    variant.isActive = false;

    await variant.save();

    return {
      message: 'Variant deleted successfully.',
    };
  }

  async decreaseStock(id: string, quantity: number) {
    const variant = await this.findById(id);

    if (variant.stock < quantity) {
      throw new BadRequestException('Insufficient stock.');
    }

    variant.stock -= quantity;

    await variant.save();

    return variant;
  }
}
