import { validateEnv } from './env.validation';

const base = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'blog',
  DB_PASSWORD: 'secret',
  DB_NAME: 'blog',
  JWT_SECRET: 'a'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts a complete configuration', () => {
    expect(validateEnv({ ...base, NODE_ENV: 'production' })).toBeDefined();
  });

  it('lists every missing required setting at once', () => {
    expect(() => validateEnv({})).toThrow(
      /DB_HOST is required[\s\S]*DB_PORT is required[\s\S]*JWT_SECRET is required/,
    );
  });

  it('rejects a DB_PORT that is not a number', () => {
    expect(() => validateEnv({ ...base, DB_PORT: 'abc' })).toThrow(
      /DB_PORT must be a number/,
    );
  });

  it('rejects a short JWT_SECRET in production only', () => {
    const short = { ...base, JWT_SECRET: 'short' };
    expect(() => validateEnv({ ...short, NODE_ENV: 'production' })).toThrow(
      /JWT_SECRET must be at least 32 characters/,
    );
    expect(() =>
      validateEnv({ ...short, NODE_ENV: 'development' }),
    ).not.toThrow();
  });
});
