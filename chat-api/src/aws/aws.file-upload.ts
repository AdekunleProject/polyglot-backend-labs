import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

@Injectable()
export class FileUpload {
  private readonly logger = new Logger(FileUpload.name);
  private readonly s3?: S3Client;
  private readonly bucket?: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('AWS_S3_BUCKET');
    if (!this.bucket) {
      this.logger.warn('AWS_S3_BUCKET is not set: image uploads are disabled');
      return;
    }
    const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
    this.s3 = new S3Client({
      region: config.get<string>('AWS_REGION'),
      // Without explicit keys the SDK falls back to its default chain, which
      // is how an IAM role on EKS or EC2 supplies credentials, so no key has
      // to be stored at all.
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  private storage(): { s3: S3Client; bucket: string } {
    if (!this.s3 || !this.bucket) {
      throw new ServiceUnavailableException('Image uploads are not configured');
    }
    return { s3: this.s3, bucket: this.bucket };
  }

  /** Stores the file and returns its object key. */
  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    const { s3, bucket } = this.storage();
    // The key is generated, never taken from the client's file name.
    const key = `${folder}/${randomUUID()}${EXTENSIONS[file.mimetype] ?? ''}`;
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      return key;
    } catch (error) {
      this.logger.error('S3 upload failed', error as Error);
      throw new InternalServerErrorException('Could not upload the image');
    }
  }

  /** A link that works for 30 minutes. The bucket itself stays private. */
  async getDownloadUrl(key: string): Promise<string> {
    const { s3, bucket } = this.storage();
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: 1800,
    });
  }

  /** Best effort: a leftover object is harmless, a failed request is not. */
  async deleteFile(key: string): Promise<void> {
    if (!this.s3 || !this.bucket) return;
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      this.logger.warn(`Could not delete ${key}: ${(error as Error).message}`);
    }
  }

  /**
   * A link the phone uploads to directly, so large videos never pass through
   * the API. It is valid for 15 minutes and only accepts this exact type and size.
   */
  async createUploadUrl(key: string, contentType: string, size: number): Promise<string> {
    const { s3, bucket } = this.storage();
    return getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
      }),
      { expiresIn: 900 },
    );
  }

  /** The stored object's size, or null when nothing was uploaded under that key. */
  async headFile(key: string): Promise<{ size: number } | null> {
    const { s3, bucket } = this.storage();
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { size: Number(head.ContentLength ?? 0) };
    } catch {
      return null;
    }
  }
}
