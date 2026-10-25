import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  ProductVariant,
  ProductVariantSchema,
} from './schemas/product-variant.schema';

import { VariantsController } from './product-variant.controller';
import { VariantsService } from './product-variant.service';
import { FileUpload } from 'src/aws/aws.file-upload';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ProductVariant.name,
        schema: ProductVariantSchema,
      },
    ]),
  ],
  controllers: [VariantsController],
  providers: [VariantsService, FileUpload],
  exports: [VariantsService],
})
export class VariantsModule {}
