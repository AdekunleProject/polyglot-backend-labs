// src/aws.multer-uploads.ts
import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const allowed = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
]);
export const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;

export const uploadOptions: MulterOptions = {
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    if (!allowed.has(file.mimetype)) {
      return cb(
        new BadRequestException(
          'Incorrect file format. Allowed: pdf, jpeg, png',
        ),
        false,
      );
    }
    cb(null, true);
  },
};
