// In-memory per-key sliding window. Scoped to a single running container
// (Coolify) — it resets on restart and isn't shared across replicas, which is
// fine for blunting abuse of a public demo. Swap for Upstash/Redis if you
// scale out. Not a substitute for a prepaid OpenAI spend ceiling.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Opportunistic prune so the map can't grow without bound.
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
    }
    return { ok: true, retryAfterSec: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

// Best-effort client IP behind a reverse proxy (Coolify/Traefik set
// x-forwarded-for). Falls back to a constant so a missing header degrades to a
// shared global bucket rather than no limit at all.
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
