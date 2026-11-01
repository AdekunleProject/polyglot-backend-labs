import { validateEnv } from './env.validation';
import { parseCorsOrigins } from './cors';

const valid = {
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_SECRET: 'a'.repeat(40),
  PAYSTACK_SECRET_KEY: 'sk_test_x',
};

describe('validateEnv', () => {
  it('accepts a complete configuration', () => {
    expect(validateEnv(valid)).toEqual(valid);
  });

  it('names every missing key', () => {
    expect(() => validateEnv({ MONGODB_URI: 'x' })).toThrow(
      'JWT_SECRET, PAYSTACK_SECRET_KEY',
    );
  });

  it('treats an empty string as missing', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: '   ' })).toThrow(
      'JWT_SECRET',
    );
  });

  it('refuses a short JWT secret in production only', () => {
    const weak = { ...valid, JWT_SECRET: 'short' };
    expect(() => validateEnv({ ...weak, NODE_ENV: 'production' })).toThrow(
      'at least 32',
    );
    expect(() => validateEnv({ ...weak, NODE_ENV: 'development' })).not.toThrow();
  });
});

describe('parseCorsOrigins', () => {
  it('splits and trims a list of origins', () => {
    expect(parseCorsOrigins(' https://a.com , https://b.com ', 'production')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('allows nothing by default in production', () => {
    expect(parseCorsOrigins(undefined, 'production')).toBe(false);
  });

  it('allows everything by default in development', () => {
    expect(parseCorsOrigins('', 'development')).toBe(true);
  });
});
