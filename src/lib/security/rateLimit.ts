/**
 * Minimal in-memory sliding-window rate limiter. Per-instance only (not
 * distributed across serverless/multi-node deployments) — acceptable for
 * the auth-abuse-slowdown use case this exists for (password reset
 * request spam), where the goal is raising the cost of a brute-force loop
 * rather than a hard multi-instance guarantee. If this app ever runs
 * behind more than one Node process sharing a workload, move this to
 * Redis/Mongo instead.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Returns true if the request is allowed, false if the key has exceeded
 * `limit` hits within the trailing `windowMs`.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
}

// Periodic cleanup so the map doesn't grow unbounded across a long-lived
// process — cheap since buckets are tiny and this only walks live keys.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref?.();
