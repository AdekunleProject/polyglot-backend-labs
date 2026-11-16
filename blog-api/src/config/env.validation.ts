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
    const secret = get('JWT_SECRET');
    if (secret && secret.length < 32) {
      problems.push('JWT_SECRET must be at least 32 characters in production');
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n - ${problems.join('\n - ')}`,
    );
  }
  return config;
}
