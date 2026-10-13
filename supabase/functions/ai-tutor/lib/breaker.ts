// In-memory circuit breaker for the Gemini upstream (one per isolate, spec 5 §3 step 7).
// closed → open after `failureThreshold` upstream failures within `windowMs`, or at once on a
// per-day quota 429; open → half_open after `openMs`, where a single probe is let through: its
// success closes the breaker, its failure re-opens it.

import type { GeminiErrorKind } from './gemini.ts';

export type BreakerState = 'closed' | 'open' | 'half_open';

export interface Breaker {
  canRequest(): boolean;
  retryAfterSec(): number;
  onSuccess(): void;
  onFailure(kind: GeminiErrorKind): void;
  state(): BreakerState;
}

/** Failures that say the upstream is unhealthy; the rest are about one request (schema, safety). */
const UPSTREAM_FAILURES: ReadonlySet<GeminiErrorKind> = new Set<GeminiErrorKind>([
  'timeout',
  'rate_limited',
  'daily_quota',
  'unavailable',
  'network',
]);

export function createBreaker(o: {
  failureThreshold: number;
  windowMs: number;
  openMs: number;
  now: () => number;
}): Breaker {
  let failures: number[] = [];
  let openedAt: number | null = null;
  /** Start time of the half-open probe in flight; null = no probe yet. */
  let probeAt: number | null = null;

  const current = (): BreakerState => {
    if (openedAt === null) return 'closed';
    return o.now() - openedAt >= o.openMs ? 'half_open' : 'open';
  };

  const open = () => {
    openedAt = o.now();
    probeAt = null;
    failures = [];
  };

  const close = () => {
    openedAt = null;
    probeAt = null;
    failures = [];
  };

  return {
    state: current,

    canRequest() {
      const s = current();
      if (s === 'closed') return true;
      if (s === 'open') return false;
      // half_open: one probe at a time; a probe that never reported back expires after openMs.
      if (probeAt !== null && o.now() - probeAt < o.openMs) return false;
      probeAt = o.now();
      return true;
    },

    retryAfterSec() {
      const s = current();
      if (s === 'closed') return 0;
      if (s === 'half_open') return 1;
      return Math.max(1, Math.ceil((openedAt! + o.openMs - o.now()) / 1000));
    },

    onSuccess() {
      close();
    },

    onFailure(kind) {
      const s = current();
      if (!UPSTREAM_FAILURES.has(kind)) {
        // The upstream answered: a half-open probe proves it is reachable again.
        if (s === 'half_open') close();
        return;
      }
      if (kind === 'daily_quota' || s !== 'closed') {
        open();
        return;
      }
      const now = o.now();
      failures = failures.filter((t) => now - t < o.windowMs);
      failures.push(now);
      if (failures.length >= o.failureThreshold) open();
    },
  };
}
