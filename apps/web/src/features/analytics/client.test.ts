import { ANALYTICS_BATCH_MAX, analyticsEventSchema } from '@linguo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import {
  ANALYTICS_FLUSH_INTERVAL_MS,
  ANALYTICS_QUEUE_MAX,
  configureAnalytics,
  flushAnalytics,
  pendingAnalyticsEvents,
  setAnalyticsRoute,
  track,
} from './client';

type Batch = Array<{ name: string; props: Record<string, unknown>; at: string; route: string | null }>;

function rpcClient(impl: (name: string, args: unknown) => unknown = () => Promise.resolve({ data: 0, error: null })) {
  const rpc = vi.fn(impl);
  return { rpc, client: { rpc } as unknown as AppSupabaseClient };
}

const batches = (rpc: ReturnType<typeof vi.fn>): Batch[] =>
  rpc.mock.calls.map((call) => (call[1] as { p_events: Batch }).p_events);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
});

afterEach(() => {
  configureAnalytics({ client: null, enabled: false });
  setAnalyticsRoute(null);
  vi.useRealTimers();
});

describe('track', () => {
  it('is a no-op until configured, when disabled or without a client', async () => {
    const { rpc, client } = rpcClient();
    track('lesson_started');
    configureAnalytics({ client, enabled: false });
    track('lesson_started');
    configureAnalytics({ client: null, enabled: true });
    track('lesson_started');
    expect(pendingAnalyticsEvents()).toBe(0);
    await vi.advanceTimersByTimeAsync(ANALYTICS_FLUSH_INTERVAL_MS);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('batches events and sends them after 10 s with the route pattern', async () => {
    const { rpc, client } = rpcClient();
    configureAnalytics({ client, enabled: true });
    setAnalyticsRoute('/app/hoc-tap/bai/:lessonId');
    track('lesson_started', { lesson_kind: 'core' });
    track('lesson_completed', { accuracy: 0.9, perfect: false });

    await vi.advanceTimersByTimeAsync(ANALYTICS_FLUSH_INTERVAL_MS - 1);
    expect(rpc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe('track_events');
    const [batch] = batches(rpc);
    expect(batch).toEqual([
      { name: 'lesson_started', props: { lesson_kind: 'core' }, at: '2026-10-13T08:00:00.000Z', route: '/app/hoc-tap/bai/:lessonId' },
      { name: 'lesson_completed', props: { accuracy: 0.9, perfect: false }, at: '2026-10-13T08:00:00.000Z', route: '/app/hoc-tap/bai/:lessonId' },
    ]);
    for (const event of batch!) expect(analyticsEventSchema.safeParse(event).success).toBe(true);
    expect(pendingAnalyticsEvents()).toBe(0);
  });

  it('flushes immediately once 20 events are queued', async () => {
    const { rpc, client } = rpcClient();
    configureAnalytics({ client, enabled: true });
    for (let i = 0; i < ANALYTICS_BATCH_MAX - 1; i++) track('page_view');
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).not.toHaveBeenCalled();
    track('page_view');
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(batches(rpc)[0]).toHaveLength(ANALYTICS_BATCH_MAX);
  });

  it('drops invalid events', async () => {
    const { rpc, client } = rpcClient();
    configureAnalytics({ client, enabled: true });
    track('not_an_event' as never);
    track('lesson_started', { BadKey: 1 });
    track('lesson_started', { note: 'x'.repeat(65) });
    track('lesson_started', { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9 });
    expect(pendingAnalyticsEvents()).toBe(0);
    track('lesson_started', { ok: 'yes' });
    await flushAnalytics();
    expect(batches(rpc)).toEqual([[expect.objectContaining({ name: 'lesson_started', props: { ok: 'yes' } })]]);
  });

  it('caps the queue at 100 by dropping the oldest events', async () => {
    const { rpc, client } = rpcClient();
    configureAnalytics({ client, enabled: true });
    // Synchronous burst: the 20-event flush only starts taking events after this loop.
    for (let i = 0; i < ANALYTICS_QUEUE_MAX + 5; i++) track('page_view', { n: i });
    expect(pendingAnalyticsEvents()).toBe(ANALYTICS_QUEUE_MAX);
    await flushAnalytics();
    expect(batches(rpc).flat().map((e) => e.props.n)).toEqual(Array.from({ length: ANALYTICS_QUEUE_MAX }, (_, i) => i + 5));
    expect(batches(rpc).every((b) => b.length <= ANALYTICS_BATCH_MAX)).toBe(true);
  });

  it('swallows RPC errors, rejections and synchronous throws', async () => {
    const failing = [
      () => Promise.resolve({ data: null, error: { message: 'rate_limited', code: 'P0001' } }),
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => {
        throw new Error('boom');
      },
    ];
    for (const impl of failing) {
      const { rpc, client } = rpcClient(impl);
      configureAnalytics({ client, enabled: true });
      track('exam_started');
      await expect(flushAnalytics()).resolves.toBeUndefined();
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(pendingAnalyticsEvents()).toBe(0);
      configureAnalytics({ client: null, enabled: false });
    }
  });

  it('keeps working after a failed batch', async () => {
    let fail = true;
    const { rpc, client } = rpcClient(() => (fail ? Promise.reject(new Error('down')) : Promise.resolve({ data: 1, error: null })));
    configureAnalytics({ client, enabled: true });
    track('exam_started');
    await flushAnalytics();
    fail = false;
    track('exam_completed');
    await vi.advanceTimersByTimeAsync(ANALYTICS_FLUSH_INTERVAL_MS);
    expect(batches(rpc).map((b) => b.map((e) => e.name))).toEqual([['exam_started'], ['exam_completed']]);
  });

  it('drops queued events when disabled (opt-out or sign-out)', async () => {
    const { rpc, client } = rpcClient();
    configureAnalytics({ client, enabled: true });
    track('progress_viewed');
    configureAnalytics({ client, enabled: false });
    await vi.advanceTimersByTimeAsync(ANALYTICS_FLUSH_INTERVAL_MS);
    expect(rpc).not.toHaveBeenCalled();
    configureAnalytics({ client, enabled: true });
    await flushAnalytics();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps the queue when configured again with the same client', () => {
    const { client } = rpcClient();
    configureAnalytics({ client, enabled: true });
    track('progress_viewed');
    configureAnalytics({ client, enabled: true });
    expect(pendingAnalyticsEvents()).toBe(1);
  });
});

describe('flushAnalytics', () => {
  it('resolves with nothing to send', async () => {
    await expect(flushAnalytics()).resolves.toBeUndefined();
  });

  it('splits a large queue into batches of at most 20', async () => {
    const pending: Array<() => void> = [];
    const { rpc, client } = rpcClient(() => new Promise((resolve) => pending.push(() => resolve({ data: 20, error: null }))));
    configureAnalytics({ client, enabled: true });
    // First 20 trigger an immediate flush that stays pending; 25 more wait behind it.
    for (let i = 0; i < 45; i++) track('page_view', { n: i });
    const done = flushAnalytics();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(0);
      pending.shift()?.();
    }
    await done;
    expect(batches(rpc).map((b) => b.length)).toEqual([20, 20, 5]);
    expect(batches(rpc).flat().map((e) => e.props.n)).toEqual(Array.from({ length: 45 }, (_, i) => i));
  });

  it('cancels the pending 10 s timer', async () => {
    const { rpc, client } = rpcClient();
    configureAnalytics({ client, enabled: true });
    track('page_view');
    await flushAnalytics();
    await vi.advanceTimersByTimeAsync(ANALYTICS_FLUSH_INTERVAL_MS);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
