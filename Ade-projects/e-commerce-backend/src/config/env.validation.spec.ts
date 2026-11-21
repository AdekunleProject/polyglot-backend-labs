import { validateEnv } from './env.validation';

const strong = 'a'.repeat(32);
const base = {
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_SECRET: strong,
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts a complete configuration', () => {
    expect(validateEnv({ ...base, NODE_ENV: 'production' })).toBeDefined();
  });

  it('lists every missing required setting at once', () => {
    expect(() => validateEnv({})).toThrow(
      /MONGODB_URI is required[\s\S]*JWT_SECRET is required[\s\S]*JWT_REFRESH_SECRET is required/,
    );
  });

  it('rejects short secrets in production only', () => {
    const short = { ...base, JWT_SECRET: 'ci', JWT_REFRESH_SECRET: 'ci2' };
    expect(() => validateEnv({ ...short, NODE_ENV: 'production' })).toThrow(
      /JWT_SECRET must be at least 32 characters/,
    );
    expect(() => validateEnv({ ...short, NODE_ENV: 'development' })).not.toThrow();
  });

  it('rejects identical access and refresh secrets in production', () => {
    expect(() =>
      validateEnv({ ...base, JWT_REFRESH_SECRET: strong, NODE_ENV: 'production' }),
    ).toThrow(/must be different/);
  });

  it('checks the optional Redis URL and two-factor key', () => {
    expect(() => validateEnv({ ...base, REDIS_URL: 'localhost:6379' })).toThrow(
      /REDIS_URL must start with redis/,
    );
    expect(() => validateEnv({ ...base, REDIS_URL: 'redis://redis:6379' })).not.toThrow();
    expect(() => validateEnv({ ...base, TWO_FACTOR_KEY: 'short' })).toThrow(
      /TWO_FACTOR_KEY must be at least 16/,
    );
  });
});
