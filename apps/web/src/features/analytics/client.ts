import { ANALYTICS_BATCH_MAX, analyticsEventSchema, type AnalyticsEvent, type AnalyticsEventName } from '@linguo/shared';
import { callRpc } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Spec 8 §3–4: internal, best-effort analytics. Events wait in memory and go to `track_events` in batches every
// 10 s, as soon as 20 are waiting, or when the page is hidden. Nothing here ever throws or shows a toast: a lost
// event is acceptable, a broken screen is not.

export const ANALYTICS_FLUSH_INTERVAL_MS = 10_000;
/** Oldest events are dropped beyond this (e.g. a long offline session). */
export const ANALYTICS_QUEUE_MAX = 100;

let client: AppSupabaseClient | null = null;
let queue: AnalyticsEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let route: string | null = null;
let inflight: Promise<void> = Promise.resolve();
/** A flush is chained but has not started taking events yet: the 20-event trigger need not chain another. */
let flushQueued = false;

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/**
 * Called by AnalyticsProvider. `enabled` is false when signed out or opted out; disabling (or switching client)
 * drops whatever is still queued.
 */
export function configureAnalytics(o: { client: AppSupabaseClient | null; enabled: boolean }): void {
  const next = o.enabled ? o.client : null;
  if (next !== client) {
    queue = [];
    clearTimer();
  }
  client = next;
}

/** Route pattern attached to every following event (set by RouteTracker). */
export function setAnalyticsRoute(pattern: string | null): void {
  route = pattern;
}

/** Queues an event. Invalid events (unknown name, non-allowlisted props) are dropped silently. */
export function track(
  name: AnalyticsEventName,
  props: Record<string, string | number | boolean> = {},
  opts: { route?: string | null } = {},
): void {
  try {
    if (!client) return;
    const parsed = analyticsEventSchema.safeParse({
      name,
      props,
      at: new Date().toISOString(),
      route: opts.route !== undefined ? opts.route : route,
    });
    if (!parsed.success) return;
    queue.push(parsed.data);
    if (queue.length > ANALYTICS_QUEUE_MAX) queue.splice(0, queue.length - ANALYTICS_QUEUE_MAX);
    if (queue.length >= ANALYTICS_BATCH_MAX) {
      if (!flushQueued) void flushAnalytics();
    } else if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        void flushAnalytics();
      }, ANALYTICS_FLUSH_INTERVAL_MS);
    }
  } catch {
    // Best effort only.
  }
}

async function sendQueued(): Promise<void> {
  flushQueued = false;
  while (client && queue.length > 0) {
    const target = client;
    const batch = queue.splice(0, ANALYTICS_BATCH_MAX);
    try {
      await callRpc(target, 'track_events', { p_events: batch });
    } catch {
      // Dropped: rate limited, offline or rejected. Analytics must never retry-storm or surface errors.
    }
  }
}

/** Sends everything queued, in batches of at most ANALYTICS_BATCH_MAX. Never rejects. */
export function flushAnalytics(): Promise<void> {
  clearTimer();
  flushQueued = true;
  inflight = inflight.then(sendQueued, sendQueued);
  return inflight;
}

/** Number of events waiting (tests and debugging). */
export function pendingAnalyticsEvents(): number {
  return queue.length;
}
