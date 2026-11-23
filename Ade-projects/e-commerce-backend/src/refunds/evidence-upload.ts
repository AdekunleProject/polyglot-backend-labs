import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const allowed = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
]);

/** Photos or short videos of a damaged, faulty or wrong item. */
export const evidenceUploadOptions: MulterOptions = {
  limits: { fileSize: 25 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!allowed.has(file.mimetype)) {
      return cb(
        new BadRequestException('Evidence must be a jpeg, png, webp, mp4 or mov file'),
        false,
      );
    }
    cb(null, true);
  },
};
