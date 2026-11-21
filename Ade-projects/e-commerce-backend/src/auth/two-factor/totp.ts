import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// RFC 6238 time-based one-time passwords, the kind Google Authenticator,
// Microsoft Authenticator, Authy and 1Password show: HMAC-SHA1, 6 digits,
// a new code every 30 seconds. Written with Node's crypto so there is no
// extra dependency to audit; the spec checks it against the RFC test vectors.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160 random bits, the size RFC 4226 recommends, as base32 text. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(message).digest();
  const offset = hmac[19] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export const timeStep = (now = Date.now()): number =>
  Math.floor(now / 1000 / STEP_SECONDS);

function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Returns the time step the code belongs to, or null if it matches none.
 * One step either side is accepted, because phone and server clocks drift.
 * The caller stores the step and refuses anything not newer, so a code
 * works only once.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  now = Date.now(),
  window = 1,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = timeStep(now);
  let match: number | null = null;
  // No early exit: the time taken does not depend on which step matched.
  for (let step = current - window; step <= current + window; step++) {
    if (sameCode(hotp(secret, step), code)) match = step;
  }
  return match;
}

export function otpauthUrl(
  secretBase32: string,
  account: string,
  issuer: string,
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
