import { validateEnv } from './env.validation';

const base = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'chat',
  DB_PASSWORD: 'secret',
  DB_NAME: 'chat',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts a complete configuration', () => {
    expect(validateEnv({ ...base, NODE_ENV: 'production' })).toBeDefined();
  });

  it('lists every missing required setting at once', () => {
    expect(() => validateEnv({})).toThrow(
      /DB_HOST is required[\s\S]*DB_PORT is required[\s\S]*JWT_SECRET is required[\s\S]*JWT_REFRESH_SECRET is required/,
    );
  });

  it('rejects a DB_PORT that is not a number', () => {
    expect(() => validateEnv({ ...base, DB_PORT: 'abc' })).toThrow(
      /DB_PORT must be a number/,
    );
  });

  it('rejects short secrets in production only', () => {
    const short = { ...base, JWT_SECRET: 'short', JWT_REFRESH_SECRET: 'tiny' };
    expect(() => validateEnv({ ...short, NODE_ENV: 'production' })).toThrow(
      /JWT_SECRET must be at least 32[\s\S]*JWT_REFRESH_SECRET must be at least 32/,
    );
    expect(() =>
      validateEnv({ ...short, NODE_ENV: 'development' }),
    ).not.toThrow();
  });

  it('rejects identical access and refresh secrets in production', () => {
    const same = { ...base, JWT_REFRESH_SECRET: base.JWT_SECRET };
    expect(() => validateEnv({ ...same, NODE_ENV: 'production' })).toThrow(
      /must be different/,
    );
  });

  it('requires all three Google settings together', () => {
    expect(() => validateEnv({ ...base, GOOGLE_CLIENT_ID: 'id' })).toThrow(
      /GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL must all be set/,
    );
  });

  it('requires the admin bootstrap settings together and long enough', () => {
    expect(() => validateEnv({ ...base, ADMIN_EMAIL: 'a@b.co' })).toThrow(
      /ADMIN_EMAIL and ADMIN_PASSWORD must be set together/,
    );
    expect(() =>
      validateEnv({ ...base, ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'short' }),
    ).toThrow(/ADMIN_PASSWORD must be at least 12/);
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

  it('applies the same rules to the SUPERADMIN settings and checks REQUIRE_ADMIN_2FA', () => {
    expect(() => validateEnv({ ...base, SUPERADMIN_EMAIL: 'a@b.co' })).toThrow(
      /SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set together/,
    );
    expect(() =>
      validateEnv({ ...base, SUPERADMIN_EMAIL: 'a@b.co', SUPERADMIN_PASSWORD: 'short' }),
    ).toThrow(/SUPERADMIN_PASSWORD must be at least 12/);
    expect(() => validateEnv({ ...base, REQUIRE_ADMIN_2FA: 'yes' })).toThrow(
      /REQUIRE_ADMIN_2FA must be true or false/,
    );
  });
});
