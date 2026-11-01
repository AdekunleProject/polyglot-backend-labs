import { OTP_ALPHABET, OTP_LENGTH, generateOtp, normalizeEmail } from './otp';

describe('generateOtp', () => {
  it('returns a code of the right length using only the allowed characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtp();
      expect(code).toHaveLength(OTP_LENGTH);
      for (const char of code) expect(OTP_ALPHABET.includes(char)).toBe(true);
    }
  });

  it('does not repeat itself across many calls', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateOtp()));
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe('normalizeEmail', () => {
  it('trims and lower-cases so one person cannot register twice', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });
});
