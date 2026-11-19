import { Module } from '@nestjs/common';
import { FileUpload } from './aws.file-upload';

@Module({
  providers: [FileUpload],
  exports: [FileUpload],
})
export class AwsModule {}
