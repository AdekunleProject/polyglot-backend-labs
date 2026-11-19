import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Same rule as the e-commerce API: upper and lower case, a digit and a special
 * character, at least 8 characters. The upper limit is 72 (bcrypt reads no
 * more than 72 bytes), not the 20 the e-commerce version uses.
 */
export const StrongPassword = () =>
  applyDecorators(
    IsString(),
    MinLength(8),
    MaxLength(72),
    Matches(/(?=.*[!@#$%^&*])(?=.*[0-9])(?=.*[A-Z])(?=.*[a-z])/, {
      message:
        'Password must have upper and lower case letters, a number and at least one special character (!@#$%^&*).',
    }),
  );
