// In-memory per-IP rate limit (spec 7 §3): one fixed window per client IP, per isolate. It only
// blunts bursts from a single address before any database work; the per-user daily quota
// (ai_quota_consume) stays the real limit. Isolates are recycled, so the state is best effort.

export interface IpLimiter {
  /** Counts one request for `key`; when over the limit, returns how long to wait. */
  hit(key: string): { allowed: true } | { allowed: false; retryAfterSec: number };
}

/**
 * Client IP behind Cloudflare/Supabase: `cf-connecting-ip` when present, else the RIGHTMOST
 * `x-forwarded-for` entry (appended by the trusted proxy; the leading ones are client-controlled),
 * else one shared 'unknown' bucket.
 */
export function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf.slice(0, 64);
  const parts = req.headers.get('x-forwarded-for')?.split(',').map((p) => p.trim()).filter(Boolean);
  const last = parts?.[parts.length - 1];
  return last ? last.slice(0, 64) : 'unknown';
}

export function createIpLimiter(o: { limit: number; windowMs: number; now: () => number; maxKeys?: number }): IpLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  const maxKeys = o.maxKeys ?? 10_000;

  const prune = (now: number) => {
    for (const [k, w] of windows) if (now - w.start >= o.windowMs) windows.delete(k);
    // Still full of live keys (an address spray): evict the oldest windows (Map keeps start order
    // because a restarted window is re-inserted) instead of forgetting everyone.
    for (const k of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(k);
    }
  };

  return {
    hit(key) {
      const now = o.now();
      let w = windows.get(key);
      if (!w || now - w.start >= o.windowMs) {
        if (!w && windows.size >= maxKeys) prune(now);
        windows.delete(key);
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
