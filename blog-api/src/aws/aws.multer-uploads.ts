import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// Profile pictures only. The type is checked again by S3 when it serves it.
export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

export const uploadOptions: MulterOptions = {
  limits: { fileSize: MAX_UPLOAD_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return cb(
        new BadRequestException('Incorrect file format. Allowed: jpeg, png, webp'),
        false,
      );
    }
    cb(null, true);
  },
};
