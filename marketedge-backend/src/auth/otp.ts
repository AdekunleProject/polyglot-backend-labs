import { randomInt } from 'crypto';

// No 0/O/1/I so a code read from an email is hard to mistype.
export const OTP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const OTP_LENGTH = 6;

/** Cryptographically secure one-time code (Math.random is predictable). */
export function generateOtp(length: number = OTP_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += OTP_ALPHABET.charAt(randomInt(OTP_ALPHABET.length));
  }
  return code;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
