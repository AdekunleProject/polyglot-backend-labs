import { createHmac } from 'crypto';
import { verifyPaystackSignature } from './paystack-signature';

const SECRET = 'sk_test_secret';
const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: { amount: 5000 } }));
const sign = (payload: Buffer, secret = SECRET) =>
  createHmac('sha512', secret).update(payload).digest('hex');

describe('verifyPaystackSignature', () => {
  it('accepts a correct signature over the raw body', () => {
    expect(verifyPaystackSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a signature made with another secret', () => {
    expect(verifyPaystackSignature(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a body that was changed after signing', () => {
    const tampered = Buffer.from(body.toString().replace('5000', '1'));
    expect(verifyPaystackSignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it('rejects missing input', () => {
    expect(verifyPaystackSignature(undefined, sign(body), SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, sign(body), undefined)).toBe(false);
  });

  it('rejects a signature that is not hexadecimal or has the wrong length', () => {
    expect(verifyPaystackSignature(body, 'not-hex!', SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, 'abcd', SECRET)).toBe(false);
  });
});
