import { z } from 'zod';
import { readString, removeKey, writeString } from '@/lib/storage';
import { lessonErrorCode } from './error-map';
import type { SubmitInput, SubmitResult } from './service';

/**
 * Offline submission queue (spec §7.4). Only a temporary layer: the server stays the source of truth, nothing is
 * graded here, and an item is removed only once the server has confirmed it (or rejected it for good).
 */

export const OUTBOX_MAX_ITEMS = 200;
export const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 60_000;
const LEASE_TTL_MS = 30_000;

export const outboxKey = (userId: string) => `linguo-outbox-v1:${userId}`;
const lockName = (userId: string) => `linguo-outbox-lock-v1:${userId}`;

const outboxItemSchema = z.object({
  idempotencyKey: z.uuid(),
  runId: z.string().min(1),
  lessonId: z.string().min(1),
  exerciseId: z.string().min(1),
  exerciseVersion: z.number().int().min(1),
  response: z.json(),
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  responseMs: z.number().int().min(0),
  hintCount: z.number().int().min(0),
  clientAt: z.string().min(1),
  enqueuedAt: z.number(),
});

export interface OutboxItem extends SubmitInput {
  lessonId: string;
  /** Epoch ms when the item entered the outbox; drives the 7-day expiry. */
  enqueuedAt: number;
}

// ---------------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------------

/** Valid, unexpired, de-duplicated items in FIFO order. Corrupted storage or items are skipped, never thrown. */
export function readOutbox(userId: string, now = Date.now()): OutboxItem[] {
  const raw = readString(outboxKey(userId));
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const items: OutboxItem[] = [];
  for (const entry of parsed) {
    const result = outboxItemSchema.safeParse(entry);
    if (!result.success) continue;
    const item = result.data as OutboxItem;
    if (now - item.enqueuedAt > OUTBOX_MAX_AGE_MS || seen.has(item.idempotencyKey)) continue;
    seen.add(item.idempotencyKey);
    items.push(item);
  }
  return items;
}

function writeOutbox(userId: string, items: OutboxItem[]): void {
  if (items.length === 0) removeKey(outboxKey(userId));
  else writeString(outboxKey(userId), JSON.stringify(items));
  emit(userId, { type: 'changed', size: items.length });
}

export interface EnqueueResult {
  /** False when an item with the same idempotency key was already queued. */
  added: boolean;
  /** Oldest items dropped to stay within `OUTBOX_MAX_ITEMS`. */
  evicted: OutboxItem[];
  size: number;
}

/** Appends to the queue; an existing idempotency key keeps its original position and payload. */
export function enqueueOutbox(userId: string, input: Omit<OutboxItem, 'enqueuedAt'> & { enqueuedAt?: number }, now = Date.now()): EnqueueResult {
  const items = readOutbox(userId, now);
  if (items.some((i) => i.idempotencyKey === input.idempotencyKey)) return { added: false, evicted: [], size: items.length };
  const item = outboxItemSchema.parse({ ...input, enqueuedAt: input.enqueuedAt ?? now }) as OutboxItem;
  items.push(item);
  const evicted = items.length > OUTBOX_MAX_ITEMS ? items.splice(0, items.length - OUTBOX_MAX_ITEMS) : [];
  writeOutbox(userId, items);
  return { added: true, evicted, size: items.length };
}

export function removeFromOutbox(userId: string, idempotencyKey: string, now = Date.now()): void {
  const items = readOutbox(userId, now);
  const next = items.filter((i) => i.idempotencyKey !== idempotencyKey);
  if (next.length !== items.length) writeOutbox(userId, next);
}

export function outboxSize(userId: string, now = Date.now()): number {
  return readOutbox(userId, now).length;
}

export function pendingForRun(userId: string, runId: string, now = Date.now()): OutboxItem[] {
  return readOutbox(userId, now).filter((i) => i.runId === runId);
}

// ---------------------------------------------------------------------------------------------
// Events (same tab via listeners, other tabs via BroadcastChannel when available)
// ---------------------------------------------------------------------------------------------

export type OutboxEvent =
  | { type: 'changed'; size: number }
  | { type: 'synced'; item: OutboxItem; result: SubmitResult }
  | { type: 'failed'; item: OutboxItem; code: string | null };

type Listener = (event: OutboxEvent) => void;

interface Hub {
  listeners: Set<Listener>;
  channel: BroadcastChannel | null;
}
const hubs = new Map<string, Hub>();

function openChannel(userId: string): BroadcastChannel | null {
  return typeof BroadcastChannel === 'function' ? new BroadcastChannel(outboxKey(userId)) : null;
}

function emit(userId: string, event: OutboxEvent): void {
  const hub = hubs.get(userId);
  hub?.listeners.forEach((l) => l(event));
  try {
    if (hub?.channel) hub.channel.postMessage(event);
    else {
      const channel = openChannel(userId);
      channel?.postMessage(event);
      channel?.close();
    }
  } catch {
    // Other tabs will catch up on their next flush trigger.
  }
}

/** Events for this user's outbox, from this tab and from other tabs. */
export function subscribeOutbox(userId: string, listener: Listener): () => void {
  let hub = hubs.get(userId);
  if (!hub) {
    const channel = openChannel(userId);
    const created: Hub = { listeners: new Set(), channel };
    if (channel) channel.onmessage = (e: MessageEvent<OutboxEvent>) => created.listeners.forEach((l) => l(e.data));
    hubs.set(userId, created);
    hub = created;
  }
  hub.listeners.add(listener);
  const owned = hub;
  return () => {
    owned.listeners.delete(listener);
    if (owned.listeners.size === 0) {
      owned.channel?.close();
      hubs.delete(userId);
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Cross-tab lock: Web Locks when available, otherwise a localStorage lease
// ---------------------------------------------------------------------------------------------

const tabId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());

interface Lease {
  owner: string;
  expiresAt: number;
}

function readLease(key: string): Lease | null {
  try {
    const v = JSON.parse(readString(key) ?? 'null') as Lease | null;
    return v && typeof v.owner === 'string' && typeof v.expiresAt === 'number' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Runs `fn` while holding this user's outbox lock; resolves `null` without running it when another tab holds it.
 * `renew` keeps a localStorage lease alive during long flushes (a no-op under Web Locks).
 */
export async function withOutboxLock<T>(userId: string, fn: (renew: () => void) => Promise<T>): Promise<T | null> {
  const name = lockName(userId);
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (locks && typeof locks.request === 'function') {
    return locks.request(name, { ifAvailable: true }, async (lock) => (lock ? fn(() => {}) : null));
  }
  const current = readLease(name);
  if (current && current.owner !== tabId && current.expiresAt > Date.now()) return null;
  const renew = () => writeString(name, JSON.stringify({ owner: tabId, expiresAt: Date.now() + LEASE_TTL_MS }));
  renew();
  if (readLease(name)?.owner !== tabId) return null;
  try {
    return await fn(renew);
  } finally {
    if (readLease(name)?.owner === tabId) removeKey(name);
  }
}

// ---------------------------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------------------------

export type FlushStatus = 'done' | 'retry' | 'blocked' | 'locked';

/** Network failures and rate limiting are retried later with the same idempotency key. */
export function isRetryable(error: unknown): boolean {
  const code = lessonErrorCode(error);
  return code === 'network_error' || code === 'rate_limited';
}

/** Session problems stop the flush but keep the items (they are still valid once signed in again). */
function isBlocking(error: unknown): boolean {
  const code = lessonErrorCode(error);
  return code === 'not_authenticated' || code === 'PGRST301' || code === 'PGRST303';
}

export interface FlushOptions {
  userId: string;
  send: (item: OutboxItem) => Promise<SubmitResult>;
  now?: () => number;
}

/** Sends queued items strictly in FIFO order; stops at the first retryable failure so order is preserved. */
export async function flushOutbox({ userId, send, now = Date.now }: FlushOptions): Promise<FlushStatus> {
  const status = await withOutboxLock(userId, async (renew) => {
    for (;;) {
      renew();
      const head = readOutbox(userId, now())[0];
      if (!head) return 'done' as const;
      try {
        const result = await send(head);
        removeFromOutbox(userId, head.idempotencyKey, now());
        emit(userId, { type: 'synced', item: head, result });
      } catch (error) {
        if (isRetryable(error)) return 'retry' as const;
        if (isBlocking(error)) return 'blocked' as const;
        // Permanently rejected (e.g. run no longer active, conflict): drop it so it cannot block the queue.
        removeFromOutbox(userId, head.idempotencyKey, now());
        emit(userId, { type: 'failed', item: head, code: lessonErrorCode(error) });
      }
    }
  });
  return status ?? 'locked';
}

/** 1 s, 2 s, 4 s… with ±25 % jitter, never above 60 s. `failures` counts consecutive failed flushes (≥ 1). */
export function backoffDelay(failures: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
  return Math.min(BACKOFF_MAX_MS, Math.round(base * (0.75 + 0.5 * random())));
}

export interface OutboxSync {
  /** Flush now (also cancels a pending backoff timer). */
  trigger: () => Promise<void>;
  stop: () => void;
}

export interface OutboxSyncOptions extends FlushOptions {
  random?: () => number;
}

/**
 * Flushes on start (app open), on `online`, when the tab becomes visible, and after a backoff when a flush could
 * not finish. Overlapping triggers are coalesced into one follow-up run.
 */
export function startOutboxSync({ random = Math.random, ...flush }: OutboxSyncOptions): OutboxSync {
  let stopped = false;
  let running: Promise<void> | null = null;
  let again = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const schedule = () => {
    failures += 1;
    clearTimer();
    timer = setTimeout(() => void trigger(), backoffDelay(failures, random));
  };

  const run = async () => {
    do {
      again = false;
      if (stopped) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // wait for `online`
      let status: FlushStatus;
      try {
        status = await flushOutbox(flush);
      } catch {
        status = 'retry';
      }
      if (stopped) return;
      if (status === 'done') failures = 0;
      else if (status === 'retry' || status === 'locked') {
        if (!again) schedule();
      }
    } while (again);
  };

  const trigger = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    clearTimer();
    if (running) {
      again = true;
      return running;
    }
    running = run().finally(() => {
      running = null;
    });
    return running;
  };

  const onOnline = () => void trigger();
  const onVisible = () => {
    if (document.visibilityState === 'visible') void trigger();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  void trigger();

  return {
    trigger,
    stop: () => {
      stopped = true;
      clearTimer();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
