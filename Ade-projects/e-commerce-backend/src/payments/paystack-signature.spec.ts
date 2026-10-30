import { createHmac } from 'crypto';
import { verifyPaystackSignature } from './paystack-signature';

describe('verifyPaystackSignature', () => {
  const secret = 'test-secret';
  const body = Buffer.from('{"event":"charge.success","data":{"amount":1000}}');
  const sign = (b: Buffer, s = secret) =>
    createHmac('sha512', s).update(b).digest('hex');

  it('accepts a correct signature over the raw body', () => {
    expect(verifyPaystackSignature(body, sign(body), secret)).toBe(true);
  });

  it('rejects a signature made with another secret', () => {
    expect(verifyPaystackSignature(body, sign(body, 'other'), secret)).toBe(
      false,
    );
  });

  it('rejects a body that was changed after signing', () => {
    const tampered = Buffer.from('{"event":"charge.success","data":{"amount":1}}');
    expect(verifyPaystackSignature(tampered, sign(body), secret)).toBe(false);
  });

  it('rejects a missing signature or a missing raw body', () => {
    expect(verifyPaystackSignature(body, undefined, secret)).toBe(false);
    expect(verifyPaystackSignature(undefined, sign(body), secret)).toBe(false);
  });

  it('rejects a signature that is not hexadecimal', () => {
    expect(verifyPaystackSignature(body, 'not-a-signature', secret)).toBe(false);
  });
});
