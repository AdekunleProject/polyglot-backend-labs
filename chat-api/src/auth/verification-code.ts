import { randomInt } from 'crypto';
import { MailTokenPurpose } from './entities/mail-token.entity';
import { hashToken } from './token-hash';

// Uppercase letters and digits without look-alikes (0/O, 1/I/L): the code is
// typed by hand from an email. randomInt, not Math.random, since it guards
// access to an account.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateVerificationCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

// Bound to the user and the purpose, so a verify code can never be used to
// reset a password and one user's code means nothing for another.
export function hashCode(
  userId: number,
  purpose: MailTokenPurpose,
  code: string,
): string {
  return hashToken(`${purpose}:${userId}:${code.toUpperCase()}`);
}
