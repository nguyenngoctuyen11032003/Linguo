import { act, renderHook } from '@testing-library/react';
import type { SubmitArgs } from '@linguo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { result, submitArgs } from './lesson-fixtures';
import { createOutbox } from './outbox';
import { OUTBOX_SYNC_INTERVAL_MS, useOutboxSync } from './useOutboxSync';

const USER = 'u1';

type Reply = { data: unknown; error?: unknown };

/** A client whose submit_exercise replies are scripted per call (the last one repeats). */
function scriptedClient(replies: Reply[]) {
  const calls: SubmitArgs[] = [];
  let i = 0;
  const rpc = vi.fn((name: string, args: SubmitArgs) => {
    if (name !== 'submit_exercise') throw new Error(`unexpected rpc ${name}`);
    calls.push(args);
    const reply = replies[Math.min(i, replies.length - 1)]!;
    i += 1;
    return Promise.resolve({ data: reply.data, error: reply.error ?? null });
  });
  return { client: { rpc } as unknown as AppSupabaseClient, calls, rpc };
}

const NETWORK = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };

function queue(...all: SubmitArgs[]) {
  const outbox = createOutbox(USER);
  all.forEach((args, queueIndex) => outbox.add({ args, queueIndex }));
  return outbox;
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (navigator as { locks?: unknown }).locks;
});

describe('useOutboxSync', () => {
  it('flushes FIFO on mount and reports each result', async () => {
    const a = submitArgs();
    const b = submitArgs();
    const outbox = queue(a, b);
    const ra = result();
    const rb = result();
    const { client, calls } = scriptedClient([{ data: ra }, { data: rb }]);
    const onResult = vi.fn();
    const { result: hook } = renderHook(() => useOutboxSync(client, USER, onResult));
    expect(hook.current.pendingCount).toBe(2);
    await settle();
    expect(calls.map((c) => c.p_idempotency_key)).toEqual([a.p_idempotency_key, b.p_idempotency_key]);
    expect(onResult).toHaveBeenNthCalledWith(1, a.p_idempotency_key, { result: ra }, expect.objectContaining({ queueIndex: 0 }));
    expect(onResult).toHaveBeenNthCalledWith(2, b.p_idempotency_key, { result: rb }, expect.objectContaining({ queueIndex: 1 }));
    expect(outbox.list()).toEqual([]);
    expect(hook.current.pendingCount).toBe(0);
  });

  it('keeps entries on network errors, backs off, and stops at the first failure', async () => {
    const a = submitArgs();
    const b = submitArgs();
    const outbox = queue(a, b);
    const { client, calls } = scriptedClient([NETWORK]);
    const onResult = vi.fn();
    const { result: hook } = renderHook(() => useOutboxSync(client, USER, onResult));
    await settle();
    expect(calls).toHaveLength(1);
    expect(onResult).not.toHaveBeenCalled();
    expect(outbox.list()[0]).toMatchObject({ tries: 1 });
    expect(hook.current.pendingCount).toBe(2);
  });

  it('drops entries rejected by the server and reports the error', async () => {
    const a = submitArgs();
    const b = submitArgs();
    const outbox = queue(a, b);
    const serverError = { message: 'invalid_response', code: 'P0001' };
    const rb = result();
    const { client } = scriptedClient([{ data: null, error: serverError }, { data: rb }]);
    const onResult = vi.fn();
    renderHook(() => useOutboxSync(client, USER, onResult));
    await settle();
    expect(onResult).toHaveBeenNthCalledWith(1, a.p_idempotency_key, { error: serverError }, expect.anything());
    expect(onResult).toHaveBeenNthCalledWith(2, b.p_idempotency_key, { result: rb }, expect.anything());
    expect(outbox.list()).toEqual([]);
  });

  it('keeps rate-limited entries for a later retry', async () => {
    const a = submitArgs();
    const outbox = queue(a);
    const { client } = scriptedClient([{ data: null, error: { message: 'rate_limited', code: 'P0001' } }]);
    const onResult = vi.fn();
    renderHook(() => useOutboxSync(client, USER, onResult));
    await settle();
    expect(onResult).not.toHaveBeenCalled();
    expect(outbox.list()).toHaveLength(1);
  });

  it('keeps entries on transient server failures (5xx, expired JWT) instead of dropping the answer', async () => {
    const a = submitArgs();
    const outbox = queue(a);
    const onResult = vi.fn();
    const gateway = scriptedClient([{ data: null, error: { message: 'Bad gateway', code: '', status: 502 } }]);
    const first = renderHook(() => useOutboxSync(gateway.client, USER, onResult));
    await settle();
    first.unmount();
    const jwt = scriptedClient([{ data: null, error: { message: 'JWT expired', code: 'PGRST301' } }]);
    renderHook(() => useOutboxSync(jwt.client, USER, onResult));
    await settle();
    expect(gateway.calls).toHaveLength(1);
    expect(jwt.calls).toHaveLength(1);
    expect(onResult).not.toHaveBeenCalled();
    expect(outbox.list()).toMatchObject([{ tries: 2 }]);
  });

  it('retries on the 15 s interval once the backoff has elapsed, and on online', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const a = submitArgs();
    queue(a);
    const ra = result();
    const { client, calls } = scriptedClient([NETWORK, NETWORK, { data: ra }]);
    const onResult = vi.fn();
    const { result: hook } = renderHook(() => useOutboxSync(client, USER, onResult));
    await settle();
    expect(calls).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OUTBOX_SYNC_INTERVAL_MS);
    });
    expect(calls).toHaveLength(2);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toHaveLength(3);
    expect(onResult).toHaveBeenCalledWith(a.p_idempotency_key, { result: ra }, expect.anything());
    expect(hook.current.pendingCount).toBe(0);
    // Nothing left: the interval stops polling.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OUTBOX_SYNC_INTERVAL_MS * 2);
    });
    expect(calls).toHaveLength(3);
  });

  it('does not retry on the interval before the backoff has elapsed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const a = submitArgs();
    const outbox = queue(a);
    outbox.markFailed(a.p_idempotency_key, Date.now());
    outbox.markFailed(a.p_idempotency_key, Date.now());
    outbox.markFailed(a.p_idempotency_key, Date.now());
    outbox.markFailed(a.p_idempotency_key, Date.now());
    outbox.markFailed(a.p_idempotency_key, Date.now()); // next try ~16 s away
    const { client, calls } = scriptedClient([NETWORK]);
    renderHook(() => useOutboxSync(client, USER, vi.fn()));
    await settle(); // mount flush ignores backoff
    expect(calls).toHaveLength(1); // the failed mount flush pushed the next try ~32 s away
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OUTBOX_SYNC_INTERVAL_MS);
    });
    expect(calls).toHaveLength(1);
  });

  it('flushes when the tab becomes visible', async () => {
    const { client, calls } = scriptedClient([{ data: result() }]);
    renderHook(() => useOutboxSync(client, USER, vi.fn()));
    await settle();
    expect(calls).toHaveLength(0);
    queue(submitArgs());
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toHaveLength(1);
  });

  it('counts entries added by the same tab', async () => {
    const { client } = scriptedClient([NETWORK]);
    const { result: hook } = renderHook(() => useOutboxSync(client, USER, vi.fn()));
    await settle();
    act(() => {
      createOutbox(USER).add({ args: submitArgs(), queueIndex: 0 });
    });
    expect(hook.current.pendingCount).toBe(1);
  });

  it('exposes flush and serialises it through navigator.locks', async () => {
    const request = vi.fn((_name: string, cb: () => Promise<void>) => cb());
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    const { client, calls } = scriptedClient([{ data: result() }]);
    const { result: hook } = renderHook(() => useOutboxSync(client, USER, vi.fn()));
    await settle();
    queue(submitArgs());
    await act(async () => {
      await hook.current.flush();
    });
    expect(calls).toHaveLength(1);
    expect(request).toHaveBeenCalledWith('linguo-outbox', expect.any(Function));
  });

  it('does nothing without a client or a user', async () => {
    queue(submitArgs());
    const { result: hook } = renderHook(() => useOutboxSync(null, null, vi.fn()));
    await settle();
    expect(hook.current.pendingCount).toBe(0);
    await expect(hook.current.flush()).resolves.toBeUndefined();
  });
});
