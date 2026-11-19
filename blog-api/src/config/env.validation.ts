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
  if (!!get('ADMIN_EMAIL') !== !!get('ADMIN_PASSWORD')) {
    problems.push('ADMIN_EMAIL and ADMIN_PASSWORD must be set together');
  }
  if (get('ADMIN_PASSWORD') && get('ADMIN_PASSWORD').length < 12) {
    problems.push('ADMIN_PASSWORD must be at least 12 characters');
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n - ${problems.join('\n - ')}`,
    );
  }
  return config;
}
