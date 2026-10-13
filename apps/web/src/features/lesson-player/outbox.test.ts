import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitArgs } from './lesson-fixtures';
import { OUTBOX_CAP, OUTBOX_CHANGE_EVENT, OUTBOX_MAX_AGE_MS, backoffMs, createOutbox, outboxKey } from './outbox';

const USER = 'u1';
const NOW = Date.parse('2026-10-13T08:00:00Z');

afterEach(() => vi.restoreAllMocks());

describe('outbox', () => {
  it('stores entries per user under linguo-outbox-v1:<userId>', () => {
    const outbox = createOutbox(USER);
    const args = submitArgs();
    outbox.add({ args, queueIndex: 2, createdAt: '2026-10-13T08:00:00Z' });
    expect(outbox.key).toBe('linguo-outbox-v1:u1');
    expect(outboxKey('u2')).toBe('linguo-outbox-v1:u2');
    expect(JSON.parse(localStorage.getItem('linguo-outbox-v1:u1')!)).toEqual([
      { args, queueIndex: 2, createdAt: '2026-10-13T08:00:00Z', tries: 0, nextAttemptAt: 0 },
    ]);
    expect(createOutbox('u2').list()).toEqual([]);
  });

  it('lists FIFO and dedupes by idempotency key', () => {
    const outbox = createOutbox(USER);
    const a = submitArgs();
    const b = submitArgs();
    outbox.add({ args: a, queueIndex: 0 });
    outbox.add({ args: b, queueIndex: 1 });
    outbox.add({ args: { ...a, p_response_ms: 9 }, queueIndex: 5 });
    expect(outbox.list().map((e) => [e.args.p_idempotency_key, e.queueIndex])).toEqual([
      [a.p_idempotency_key, 0],
      [b.p_idempotency_key, 1],
    ]);
  });

  it('caps at 200 entries dropping the oldest', () => {
    const outbox = createOutbox(USER);
    const all = Array.from({ length: OUTBOX_CAP + 1 }, () => submitArgs());
    for (const args of all) outbox.add({ args, queueIndex: 0 });
    const keys = outbox.list().map((e) => e.args.p_idempotency_key);
    expect(keys).toHaveLength(OUTBOX_CAP);
    expect(keys[0]).toBe(all[1]!.p_idempotency_key);
    expect(keys.at(-1)).toBe(all.at(-1)!.p_idempotency_key);
  });

  it('removes by key', () => {
    const outbox = createOutbox(USER);
    const a = submitArgs();
    const b = submitArgs();
    outbox.add({ args: a, queueIndex: 0 });
    outbox.add({ args: b, queueIndex: 1 });
    outbox.remove(a.p_idempotency_key);
    expect(outbox.list().map((e) => e.args.p_idempotency_key)).toEqual([b.p_idempotency_key]);
    outbox.remove(b.p_idempotency_key);
    expect(localStorage.getItem(outbox.key)).toBeNull();
  });

  it('backs off exponentially with jitter, capped at 60 s', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(backoffMs(0)).toBeCloseTo(1000, -1);
    expect(backoffMs(3)).toBeCloseTo(8000, -1);
    expect(backoffMs(10)).toBeCloseTo(60000, -1);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(backoffMs(1)).toBe(1000);
  });

  it('markFailed counts tries and schedules the next attempt', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const outbox = createOutbox(USER);
    const a = submitArgs();
    outbox.add({ args: a, queueIndex: 0 });
    outbox.markFailed(a.p_idempotency_key, NOW);
    expect(outbox.list()[0]).toMatchObject({ tries: 1, nextAttemptAt: NOW + 500 });
    outbox.markFailed(a.p_idempotency_key, NOW);
    expect(outbox.list()[0]).toMatchObject({ tries: 2, nextAttemptAt: NOW + 1000 });
  });

  it('prunes entries older than 7 days', () => {
    const outbox = createOutbox(USER);
    const old = submitArgs();
    const fresh = submitArgs();
    outbox.add({ args: old, queueIndex: 0, createdAt: new Date(NOW - OUTBOX_MAX_AGE_MS - 1).toISOString() });
    outbox.add({ args: fresh, queueIndex: 1, createdAt: new Date(NOW - 1000).toISOString() });
    expect(outbox.prune(NOW).map((e) => e.args.p_idempotency_key)).toEqual([fresh.p_idempotency_key]);
    expect(outbox.list()).toHaveLength(1);
  });

  it('treats corrupt JSON as an empty list and drops invalid entries', () => {
    localStorage.setItem(outboxKey(USER), '{not json');
    expect(createOutbox(USER).list()).toEqual([]);
    const valid = { args: submitArgs(), queueIndex: 0, createdAt: '2026-10-13T08:00:00Z', tries: 0, nextAttemptAt: 0 };
    localStorage.setItem(outboxKey(USER), JSON.stringify([{ args: { p_run_id: 'x' } }, valid]));
    expect(createOutbox(USER).list()).toEqual([valid]);
    localStorage.setItem(outboxKey(USER), JSON.stringify({ a: 1 }));
    expect(createOutbox(USER).list()).toEqual([]);
  });

  it('swallows storage exceptions', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const outbox = createOutbox(USER, broken);
    const a = submitArgs();
    expect(() => outbox.add({ args: a, queueIndex: 0 })).not.toThrow();
    expect(outbox.list()).toEqual([]);
    expect(() => outbox.remove(a.p_idempotency_key)).not.toThrow();
    expect(() => outbox.markFailed(a.p_idempotency_key)).not.toThrow();
    expect(outbox.prune()).toEqual([]);
  });

  it('notifies same-tab listeners on change', () => {
    const listener = vi.fn();
    window.addEventListener(OUTBOX_CHANGE_EVENT, listener);
    createOutbox(USER).add({ args: submitArgs(), queueIndex: 0 });
    window.removeEventListener(OUTBOX_CHANGE_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
