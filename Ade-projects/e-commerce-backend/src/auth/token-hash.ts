import { createHash, timingSafeEqual } from 'crypto';

/**
 * Refresh tokens are stored as a SHA-256 hash, not with bcrypt. bcrypt only
 * reads the first 72 bytes of its input, and every JWT for the same user starts
 * with the same 72+ characters (header and the start of the payload). A bcrypt
 * hash would therefore match an OLD token as well as the current one, which
 * would defeat rotation. SHA-256 covers the whole token, and a refresh token
 * is long and random, so a fast hash is safe here.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
