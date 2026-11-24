/**
 * Per-route limits for the sensitive auth endpoints (requests per minute).
 * THROTTLE_MULTIPLIER lets the integration tests raise every limit at once.
 */
const multiplier = Number(process.env.THROTTLE_MULTIPLIER ?? 1);

export const perMinute = (limit: number) => ({
  default: { limit: limit * multiplier, ttl: 60_000 },
});
