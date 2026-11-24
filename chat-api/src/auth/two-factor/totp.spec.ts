import {
  base32Decode,
  base32Encode,
  hotp,
  otpauthUrl,
  timeStep,
  verifyTotp,
} from './totp';

// RFC 6238, appendix B: the secret is the ASCII text 12345678901234567890.
// The RFC lists 8 digit codes; ours are the last 6 digits of those.
const rfcSecret = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC 6238 test vector at t=%i', (seconds, expected) => {
    expect(hotp(base32Decode(rfcSecret), timeStep(seconds * 1000))).toBe(expected);
  });

  it('round-trips base32', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('accepts the current code and one step of clock drift, not more', () => {
    const now = 1234567890 * 1000;
    const secret = base32Decode(rfcSecret);
    const step = timeStep(now);
    expect(verifyTotp(rfcSecret, hotp(secret, step), now)).toBe(step);
    expect(verifyTotp(rfcSecret, hotp(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(rfcSecret, hotp(secret, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(rfcSecret, hotp(secret, step - 2), now)).toBeNull();
  });

  it('rejects anything that is not six digits', () => {
    expect(verifyTotp(rfcSecret, '12345')).toBeNull();
    expect(verifyTotp(rfcSecret, 'abcdef')).toBeNull();
    expect(verifyTotp(rfcSecret, '1234567')).toBeNull();
  });

  it('builds an otpauth link that authenticator apps understand', () => {
    const url = otpauthUrl('ABC234', 'ada@example.com', 'Chat API');
    expect(url.startsWith('otpauth://totp/Chat%20API%3Aada%40example.com?')).toBe(true);
    expect(url).toContain('secret=ABC234');
    expect(url).toContain('issuer=Chat+API');
  });
});
