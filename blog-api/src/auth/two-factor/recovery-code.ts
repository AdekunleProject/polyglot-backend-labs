import { randomInt } from 'crypto';
import { hashToken } from '../token-hash';

// Same look-alike-free alphabet as the emailed codes.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RECOVERY_CODE_COUNT = 8;

/** Ten characters shown as XXXXX-XXXXX, about 50 bits each. */
export function generateRecoveryCode(): string {
  let code = '';
  for (let i = 0; i < 10; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** People type these by hand: ignore case, dashes and spaces. */
export const normalizeRecoveryCode = (code: string): string =>
  code.replace(/[\s-]/g, '').toUpperCase();

// Bound to the user, so one person's code means nothing for another.
export function hashRecoveryCode(userId: number, code: string): string {
  return hashToken(`recovery:${userId}:${normalizeRecoveryCode(code)}`);
}
