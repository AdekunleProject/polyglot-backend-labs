import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Brand, BrandSchema } from './schemas/brand.schema';

import { BrandsController } from './brand.controller';
import { BrandsService } from './brand.service';
import { FileUpload } from 'src/aws/aws.file-upload';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Brand.name,
        schema: BrandSchema,
      },
    ]),
  ],
  controllers: [BrandsController],
  providers: [BrandsService, FileUpload],
  exports: [BrandsService],
})
export class BrandsModule {}
