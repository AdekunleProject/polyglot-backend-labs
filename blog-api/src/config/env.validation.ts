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

  for (const key of [
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
  ]) {
    if (!get(key)) {
      problems.push(`${key} is required`);
    }
  }

  const port = get('DB_PORT');
  if (port && !/^\d+$/.test(port)) {
    problems.push('DB_PORT must be a number');
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

  // Optional features: if one is partly configured, say so now instead of
  // failing on the first request.
  const google = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'];
  if (google.some((key) => get(key)) && !google.every((key) => get(key))) {
    problems.push(`${google.join(', ')} must all be set to enable Google sign-in`);
  }
  if (get('REDIS_URL') && !/^rediss?:\/\//.test(get('REDIS_URL'))) {
    problems.push('REDIS_URL must start with redis:// or rediss://');
  }
  if (get('TWO_FACTOR_KEY') && get('TWO_FACTOR_KEY').length < 16) {
    problems.push('TWO_FACTOR_KEY must be at least 16 characters');
  }
  // The superadmin comes from SUPERADMIN_* (or the older ADMIN_* names).
  for (const [prefix, label] of [
    ['SUPERADMIN', 'SUPERADMIN'],
    ['ADMIN', 'ADMIN'],
  ]) {
    const email = get(`${prefix}_EMAIL`);
    const password = get(`${prefix}_PASSWORD`);
    if (!!email !== !!password) {
      problems.push(`${label}_EMAIL and ${label}_PASSWORD must be set together`);
    }
    if (password && password.length < 12) {
      problems.push(`${label}_PASSWORD must be at least 12 characters`);
    }
  }
  if (get('REQUIRE_ADMIN_2FA') && !['true', 'false'].includes(get('REQUIRE_ADMIN_2FA'))) {
    problems.push('REQUIRE_ADMIN_2FA must be true or false');
  }

  if (get('MIN_APP_VERSION') && !/^\d+\.\d+\.\d+$/.test(get('MIN_APP_VERSION'))) {
    problems.push('MIN_APP_VERSION must look like 1.4.0');
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n - ${problems.join('\n - ')}`,
    );
  }
  return config;
}
