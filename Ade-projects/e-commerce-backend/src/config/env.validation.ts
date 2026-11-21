/**
 * Checks the environment once at startup, so a missing or weak setting stops
 * the app with a clear message instead of failing later on the first request.
 * Used by ConfigModule.forRoot({ validate }).
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const problems: string[] = [];
  const get = (key: string): string =>
    typeof config[key] === 'string' ? (config[key] as string).trim() : '';

  for (const key of ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    if (!get(key)) {
      problems.push(`${key} is required`);
    }
  }

  if (config.NODE_ENV === 'production') {
    for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
      const value = get(key);
      if (value && value.length < 32) {
        problems.push(`${key} must be at least 32 characters in production`);
      }
    }
    if (get('JWT_SECRET') && get('JWT_SECRET') === get('JWT_REFRESH_SECRET')) {
      problems.push(
        'JWT_SECRET and JWT_REFRESH_SECRET must be different in production',
      );
    }
  }

  if (get('REDIS_URL') && !/^rediss?:\/\//.test(get('REDIS_URL'))) {
    problems.push('REDIS_URL must start with redis:// or rediss://');
  }
  if (get('TWO_FACTOR_KEY') && get('TWO_FACTOR_KEY').length < 16) {
    problems.push('TWO_FACTOR_KEY must be at least 16 characters');
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n - ${problems.join('\n - ')}`,
    );
  }
  return config;
}
