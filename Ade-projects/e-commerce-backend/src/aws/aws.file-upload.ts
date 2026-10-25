// src/aws/aws.file-upload.ts
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class FileUpload {
  private s3: S3Client;
  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    try {
      const key = `${folder}/${Date.now()}-${file.originalname}`;
      await this.s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      return key;
    } catch (error) {
      console.log(error);
      throw new NotFoundException(error);
    }
  }

  async getDownloadUrl(key: string) {
    try {
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: key,
      });
      return getSignedUrl(this.s3, command, { expiresIn: 1800 }); // 30 minutes
    } catch (error) {
      console.log(error);
      throw new NotFoundException(error);
    }
  }

  // private bucketName = process.env.AWS_S3_BUCKET!;
  // async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
  //   try{
  //     const key = `${folder}/${Date.now()}-${file.originalname.split('.').pop()}`;
  //     const uploadFiles = await this.s3.send(
  //       new PutObjectCommand({
  //         Bucket: this.bucketName,
  //         Key: key,
  //         Body: file.buffer,
  //         ContentType: file.mimetype,
  //       }),
  //     );

  //     if (!uploadFiles) {
  //       throw new InternalServerErrorException('Failed to upload file to S3.');
  //     } else {
  //       return  `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  //     };
  //   } catch (error) {
  //     console.log(error);
  //     throw new NotFoundException(error)
  //   };
  // };
}
