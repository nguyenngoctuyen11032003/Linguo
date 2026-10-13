import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { submitResult, uuid } from '../../../tests/unit/lesson-fixtures';
import {
  backoffDelay,
  enqueueOutbox,
  flushOutbox,
  OUTBOX_MAX_AGE_MS,
  OUTBOX_MAX_ITEMS,
  outboxKey,
  outboxSize,
  pendingForRun,
  readOutbox,
  startOutboxSync,
  subscribeOutbox,
  withOutboxLock,
  type OutboxEvent,
  type OutboxItem,
} from './outbox';
import { NetworkError } from './service';

const NOW = Date.parse('2026-10-13T10:00:00Z');

function item(n: number, overrides: Partial<OutboxItem> = {}): Omit<OutboxItem, 'enqueuedAt'> & { enqueuedAt?: number } {
  return {
    idempotencyKey: uuid(n),
    runId: 'run-1',
    lessonId: 'lesson-1',
    exerciseId: `e${n}`,
    exerciseVersion: 1,
    response: { option_id: 'a' },
    confidence: null,
    responseMs: 1000,
    hintCount: 0,
    clientAt: '2026-10-13T10:00:00.000Z',
    ...overrides,
  };
}

function stubNavigator(props: { locks?: unknown; onLine: boolean }) {
  const real = navigator;
  const fake = Object.create(real) as Navigator;
  Object.defineProperty(fake, 'locks', { value: props.locks, configurable: true });
  Object.defineProperty(fake, 'onLine', { value: props.onLine, configurable: true });
  vi.stubGlobal('navigator', fake);
}

const rpcError = (message: string) => Object.assign(new Error(message), { code: 'P0001' });

beforeEach(() => {
  // Isolate from Node's real cross-thread BroadcastChannel and Web Locks; individual tests opt in.
  vi.stubGlobal('BroadcastChannel', undefined);
  stubNavigator({ locks: undefined, onLine: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('outbox storage', () => {
  it('keeps FIFO order and ignores a duplicate idempotency key', () => {
    enqueueOutbox('u1', item(1), NOW);
    enqueueOutbox('u1', item(2), NOW);
    const dup = enqueueOutbox('u1', item(1, { response: { option_id: 'b' } }), NOW);
    expect(dup).toEqual({ added: false, evicted: [], size: 2 });
    const items = readOutbox('u1', NOW);
    expect(items.map((i) => i.idempotencyKey)).toEqual([uuid(1), uuid(2)]);
    expect(items[0]?.response).toEqual({ option_id: 'a' });
  });

  it('isolates users by storage key', () => {
    enqueueOutbox('u1', item(1), NOW);
    expect(localStorage.getItem(outboxKey('u1'))).not.toBeNull();
    expect(readOutbox('u2', NOW)).toEqual([]);
    expect(outboxSize('u2', NOW)).toBe(0);
  });

  it(`evicts the oldest items beyond ${OUTBOX_MAX_ITEMS}`, () => {
    for (let n = 1; n <= OUTBOX_MAX_ITEMS; n++) enqueueOutbox('u1', item(n), NOW);
    const result = enqueueOutbox('u1', item(OUTBOX_MAX_ITEMS + 1), NOW);
    expect(result.evicted.map((i) => i.idempotencyKey)).toEqual([uuid(1)]);
    const items = readOutbox('u1', NOW);
    expect(items).toHaveLength(OUTBOX_MAX_ITEMS);
    expect(items[0]?.idempotencyKey).toBe(uuid(2));
    expect(items.at(-1)?.idempotencyKey).toBe(uuid(OUTBOX_MAX_ITEMS + 1));
  });

  it('drops items older than 7 days', () => {
    enqueueOutbox('u1', item(1, { enqueuedAt: NOW - OUTBOX_MAX_AGE_MS - 1 }), NOW);
    enqueueOutbox('u1', item(2, { enqueuedAt: NOW - OUTBOX_MAX_AGE_MS + 1000 }), NOW);
    expect(readOutbox('u1', NOW).map((i) => i.idempotencyKey)).toEqual([uuid(2)]);
  });

  it('tolerates corrupted storage', () => {
    localStorage.setItem(outboxKey('u1'), '{not json');
    expect(readOutbox('u1', NOW)).toEqual([]);
    localStorage.setItem(outboxKey('u1'), JSON.stringify({ items: [] }));
    expect(readOutbox('u1', NOW)).toEqual([]);
    // One bad entry does not cost the good ones.
    localStorage.setItem(
      outboxKey('u1'),
      JSON.stringify([{ ...item(1), enqueuedAt: NOW }, { idempotencyKey: 'nope' }, null, { ...item(2), enqueuedAt: NOW }, { ...item(2), enqueuedAt: NOW }]),
    );
    expect(readOutbox('u1', NOW).map((i) => i.idempotencyKey)).toEqual([uuid(1), uuid(2)]);
    enqueueOutbox('u1', item(3), NOW);
    expect(JSON.parse(localStorage.getItem(outboxKey('u1')) ?? '[]')).toHaveLength(3);
  });

  it('lists the pending items of one run', () => {
    enqueueOutbox('u1', item(1), NOW);
    enqueueOutbox('u1', item(2, { runId: 'run-2' }), NOW);
    expect(pendingForRun('u1', 'run-2', NOW).map((i) => i.exerciseId)).toEqual(['e2']);
  });

  it('removes the key once the queue is empty', async () => {
    enqueueOutbox('u1', item(1));
    await flushOutbox({ userId: 'u1', send: async () => submitResult() });
    expect(localStorage.getItem(outboxKey('u1'))).toBeNull();
  });
});

describe('flushOutbox', () => {
  it('sends in FIFO order, reusing each idempotency key, and reports synced items', async () => {
    enqueueOutbox('u1', item(1));
    enqueueOutbox('u1', item(2));
    const events: OutboxEvent[] = [];
    const unsubscribe = subscribeOutbox('u1', (e) => events.push(e));
    const sent: string[] = [];
    const status = await flushOutbox({
      userId: 'u1',
      send: async (i) => {
        sent.push(i.idempotencyKey);
        return submitResult({ attemptId: i.idempotencyKey });
      },
    });
    unsubscribe();
    expect(status).toBe('done');
    expect(sent).toEqual([uuid(1), uuid(2)]);
    expect(events.filter((e) => e.type === 'synced').map((e) => e.type === 'synced' && e.item.exerciseId)).toEqual(['e1', 'e2']);
    expect(events.at(-1)).toEqual({ type: 'synced', item: expect.objectContaining({ exerciseId: 'e2' }), result: expect.anything() });
    expect(events).toContainEqual({ type: 'changed', size: 0 });
  });

  it('stops at the first network failure and retries the same item with the same key', async () => {
    enqueueOutbox('u1', item(1));
    enqueueOutbox('u1', item(2));
    const send = vi.fn().mockRejectedValueOnce(new NetworkError()).mockResolvedValue(submitResult());
    expect(await flushOutbox({ userId: 'u1', send })).toBe('retry');
    expect(send).toHaveBeenCalledTimes(1);
    expect(outboxSize('u1')).toBe(2);
    expect(await flushOutbox({ userId: 'u1', send })).toBe('done');
    expect(send.mock.calls.map(([i]) => (i as OutboxItem).idempotencyKey)).toEqual([uuid(1), uuid(1), uuid(2)]);
  });

  it('treats rate limiting as retryable and a lost session as blocking', async () => {
    enqueueOutbox('u1', item(1));
    expect(await flushOutbox({ userId: 'u1', send: () => Promise.reject(rpcError('rate_limited')) })).toBe('retry');
    expect(await flushOutbox({ userId: 'u1', send: () => Promise.reject(rpcError('not_authenticated')) })).toBe('blocked');
    expect(outboxSize('u1')).toBe(1);
  });

  it('drops items the server rejects for good so they cannot block the queue', async () => {
    enqueueOutbox('u1', item(1));
    enqueueOutbox('u1', item(2));
    const events: OutboxEvent[] = [];
    const unsubscribe = subscribeOutbox('u1', (e) => events.push(e));
    const send = vi.fn().mockRejectedValueOnce(rpcError('run_not_active')).mockResolvedValue(submitResult());
    expect(await flushOutbox({ userId: 'u1', send })).toBe('done');
    unsubscribe();
    expect(events).toContainEqual({ type: 'failed', item: expect.objectContaining({ exerciseId: 'e1' }), code: 'run_not_active' });
    expect(outboxSize('u1')).toBe(0);
  });

  it('picks up items enqueued while flushing', async () => {
    enqueueOutbox('u1', item(1));
    const sent: string[] = [];
    await flushOutbox({
      userId: 'u1',
      send: async (i) => {
        sent.push(i.exerciseId);
        if (i.exerciseId === 'e1') enqueueOutbox('u1', item(2));
        return submitResult();
      },
    });
    expect(sent).toEqual(['e1', 'e2']);
  });

  it('only flushes the signed-in user’s queue', async () => {
    enqueueOutbox('u1', item(1));
    enqueueOutbox('u2', item(2));
    const send = vi.fn().mockResolvedValue(submitResult());
    await flushOutbox({ userId: 'u2', send });
    expect(send.mock.calls.map(([i]) => (i as OutboxItem).exerciseId)).toEqual(['e2']);
    expect(outboxSize('u1')).toBe(1);
  });
});

describe('cross-tab lock', () => {
  it('uses Web Locks when available and skips when another tab holds the lock', async () => {
    const request = vi.fn(async (_name: string, _opts: unknown, cb: (lock: unknown) => Promise<unknown>) => cb(null));
    stubNavigator({ locks: { request }, onLine: true });
    enqueueOutbox('u1', item(1));
    const send = vi.fn();
    expect(await flushOutbox({ userId: 'u1', send })).toBe('locked');
    expect(send).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith('linguo-outbox-lock-v1:u1', { ifAvailable: true }, expect.any(Function));
  });

  it('falls back to a localStorage lease that expires', async () => {
    const key = 'linguo-outbox-lock-v1:u1';
    localStorage.setItem(key, JSON.stringify({ owner: 'other-tab', expiresAt: Date.now() + 10_000 }));
    expect(await withOutboxLock('u1', async () => 'ran')).toBeNull();
    localStorage.setItem(key, JSON.stringify({ owner: 'other-tab', expiresAt: Date.now() - 1 }));
    expect(await withOutboxLock('u1', async () => 'ran')).toBe('ran');
    expect(localStorage.getItem(key)).toBeNull();
    localStorage.setItem(key, 'garbage');
    expect(await withOutboxLock('u1', async () => 'ran')).toBe('ran');
  });

  it('relays events from other tabs over BroadcastChannel', () => {
    const channels: FakeChannel[] = [];
    class FakeChannel {
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor(readonly name: string) {
        channels.push(this);
      }
      postMessage(data: unknown) {
        for (const c of channels) if (c !== this && c.name === this.name) c.onmessage?.({ data } as MessageEvent);
      }
      close() {
        channels.splice(channels.indexOf(this), 1);
      }
    }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    const events: OutboxEvent[] = [];
    const unsubscribe = subscribeOutbox('u1', (e) => events.push(e));
    // "Another tab" posts on the same channel name.
    const other = new FakeChannel(outboxKey('u1'));
    other.postMessage({ type: 'changed', size: 3 });
    expect(events).toEqual([{ type: 'changed', size: 3 }]);
    unsubscribe();
    other.close();
    expect(channels).toHaveLength(0);
  });
});

describe('backoff and sync triggers', () => {
  it('doubles from 1 s with jitter and caps at 60 s', () => {
    expect(backoffDelay(1, () => 0.5)).toBe(1000);
    expect(backoffDelay(2, () => 0.5)).toBe(2000);
    expect(backoffDelay(3, () => 0.5)).toBe(4000);
    expect(backoffDelay(1, () => 0)).toBe(750);
    expect(backoffDelay(1, () => 1)).toBe(1250);
    expect(backoffDelay(10, () => 1)).toBe(60_000);
    expect(backoffDelay(30, () => 0)).toBe(45_000);
  });

  it('flushes on start, retries with backoff, and flushes again on online / visibilitychange', async () => {
    vi.useFakeTimers();
    enqueueOutbox('u1', item(1));
    const send = vi.fn().mockRejectedValueOnce(new NetworkError()).mockRejectedValueOnce(new NetworkError()).mockResolvedValue(submitResult());
    const sync = startOutboxSync({ userId: 'u1', send, random: () => 0.5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1); // app open
    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2); // after 1 s
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(3); // after 2 s more
    expect(outboxSize('u1')).toBe(0);

    enqueueOutbox('u1', item(2));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(4);

    enqueueOutbox('u1', item(3));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(5);

    sync.stop();
    enqueueOutbox('u1', item(4));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('waits for the online event while the browser reports offline', async () => {
    stubNavigator({ locks: undefined, onLine: false });
    enqueueOutbox('u1', item(1));
    const send = vi.fn().mockResolvedValue(submitResult());
    const sync = startOutboxSync({ userId: 'u1', send });
    await sync.trigger();
    expect(send).not.toHaveBeenCalled();
    sync.stop();
  });
});
