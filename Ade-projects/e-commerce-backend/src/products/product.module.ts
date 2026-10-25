import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Product, ProductSchema } from './schemas/product.schema';

import { ProductsController } from './product.controller';
import { ProductsService } from './product.service';
import { FileUpload } from 'src/aws/aws.file-upload';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Product.name,
        schema: ProductSchema,
      },
    ]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService, FileUpload],
  exports: [ProductsService],
})
export class ProductsModule {}
