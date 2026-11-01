const REQUIRED_KEYS = ['MONGODB_URI', 'JWT_SECRET', 'PAYSTACK_SECRET_KEY'] as const;

/**
 * Fails fast at start-up when a required setting is missing, instead of
 * running with a guessable default (the old code fell back to a hard-coded
 * JWT secret, which would let anyone forge tokens).
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  if (config.NODE_ENV === 'production' && String(config.JWT_SECRET).length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }

  return config;
}
