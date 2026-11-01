/**
 * CORS_ORIGIN is a comma-separated list of allowed browser origins.
 * Not set: allow nothing in production (mobile apps do not need CORS),
 * allow everything while developing.
 */
export function parseCorsOrigins(
  value: string | undefined,
  nodeEnv: string | undefined,
): string[] | boolean {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length > 0) return origins;
  return nodeEnv !== 'production';
}
