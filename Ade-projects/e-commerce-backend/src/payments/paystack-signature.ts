import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Checks a Paystack webhook signature.
 * Paystack signs the RAW request body with HMAC-SHA512 using your secret key.
 * The comparison is constant-time so the signature cannot be guessed byte by byte.
 */
export function verifyPaystackSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signature || !secret) {
    return false;
  }
  if (!/^[0-9a-f]+$/i.test(signature)) {
    return false;
  }

  const expected = createHmac('sha512', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');

  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
