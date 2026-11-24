import { createHash } from 'crypto';

/**
 * SHA-256, not bcrypt: bcrypt only reads the first 72 bytes, and every JWT
 * for a user shares the same first bytes (header + start of payload), so a
 * bcrypt hash could not tell two different tokens apart. SHA-256 covers the
 * whole token, and a signed JWT already has far too much entropy to guess.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
