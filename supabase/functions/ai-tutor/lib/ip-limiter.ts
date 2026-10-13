// In-memory per-IP rate limit (spec 7 §3): one fixed window per client IP, per isolate. It only
// blunts bursts from a single address before any database work; the per-user daily quota
// (ai_quota_consume) stays the real limit. Isolates are recycled, so the state is best effort.

export interface IpLimiter {
  /** Counts one request for `key`; when over the limit, returns how long to wait. */
  hit(key: string): { allowed: true } | { allowed: false; retryAfterSec: number };
}

/** Client IP: the first `x-forwarded-for` entry (set by the Supabase edge), else 'unknown'. */
export function clientIp(req: Request): string {
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first ? first.slice(0, 64) : 'unknown';
}

export function createIpLimiter(o: { limit: number; windowMs: number; now: () => number; maxKeys?: number }): IpLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  const maxKeys = o.maxKeys ?? 10_000;

  const prune = (now: number) => {
    for (const [k, w] of windows) if (now - w.start >= o.windowMs) windows.delete(k);
    // Still too many live keys (an address spray): start over rather than grow without bound.
    if (windows.size >= maxKeys) windows.clear();
  };

  return {
    hit(key) {
      const now = o.now();
      let w = windows.get(key);
      if (!w || now - w.start >= o.windowMs) {
        if (!w && windows.size >= maxKeys) prune(now);
        w = { start: now, count: 0 };
        windows.set(key, w);
      }
      if (w.count >= o.limit) {
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((w.start + o.windowMs - now) / 1000)) };
      }
      w.count++;
      return { allowed: true };
    },
  };
}
