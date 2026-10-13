import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SubmitArgs, SubmitResult } from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';
import { isUnansweredError } from './error-map';
import {
  LESSON_OUTBOX,
  OUTBOX_CHANGE_EVENT,
  openOutbox,
  type IdempotentArgs,
  type OutboxEntry,
  type OutboxEntryOf,
  type OutboxKind,
} from './outbox';
import { submitExercise } from './service';

export const OUTBOX_SYNC_INTERVAL_MS = 15_000;
/** Server answers that are transient: keep the entry and retry later instead of dropping the learner's answer. */
const RETRYABLE_MESSAGES = new Set(['rate_limited', 'not_authenticated']);
/** PostgREST JWT errors (expired/invalid token before the session refreshes). */
const RETRYABLE_CODES = new Set(['PGRST301', 'PGRST303']);
/** HTTP statuses (besides timeouts and 5xx) where the server did not grade the answer: unauthorized, too many requests. */
const RETRYABLE_STATUSES = new Set([401, 429]);

export type OutboxOutcomeOf<R> = { result: R } | { error: unknown };
export type OutboxResultHandlerOf<A extends IdempotentArgs, R> = (
  idempotencyKey: string,
  outcome: OutboxOutcomeOf<R>,
  entry: OutboxEntryOf<A>,
) => void;

export type OutboxOutcome = OutboxOutcomeOf<SubmitResult>;
export type OutboxResultHandler = (idempotencyKey: string, outcome: OutboxOutcome, entry: OutboxEntry) => void;

/** How one outbox kind is replayed: where it is stored, the RPC that sends an entry, and the cross-tab lock. */
export interface OutboxChannel<A extends IdempotentArgs, R> {
  kind: OutboxKind<A>;
  send: (client: AppSupabaseClient, args: A) => Promise<R>;
  lockName: string;
}

/** The spec 2 lesson channel (submit_exercise). */
export const LESSON_OUTBOX_CHANNEL: OutboxChannel<SubmitArgs, SubmitResult> = {
  kind: LESSON_OUTBOX,
  send: submitExercise,
  lockName: 'linguo-outbox',
};

export interface OutboxSync {
  pendingCount: number;
  /** Sends every queued entry now (ignoring backoff), oldest first. */
  flush: () => Promise<void>;
}

/** Transient failures: the entry stays queued (with backoff) instead of being dropped. */
export function isRetryableOutboxError(error: unknown): boolean {
  if (isUnansweredError(error)) return true;
  if (!error || typeof error !== 'object') return false;
  if ('message' in error && typeof error.message === 'string' && RETRYABLE_MESSAGES.has(error.message)) return true;
  if ('code' in error && typeof error.code === 'string' && RETRYABLE_CODES.has(error.code)) return true;
  return 'status' in error && typeof error.status === 'number' && RETRYABLE_STATUSES.has(error.status);
}

interface LockManagerLike {
  request: (name: string, callback: () => Promise<void>) => Promise<void>;
}

function lockManager(): LockManagerLike | null {
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === 'function' ? locks : null;
}

function readCount<A extends IdempotentArgs>(kind: OutboxKind<A>, userId: string | null | undefined): number {
  return userId ? openOutbox(kind, userId).list().length : 0;
}

/**
 * Replays one outbox kind FIFO on mount, when the browser comes online, when the tab becomes visible and
 * every 15 s while entries remain. Tabs are serialised with navigator.locks when available.
 * `channel` must be a stable (module-level) object.
 */
export function useOutboxChannelSync<A extends IdempotentArgs, R>(
  channel: OutboxChannel<A, R>,
  client: AppSupabaseClient | null,
  userId: string | null | undefined,
  onResult: OutboxResultHandlerOf<A, R>,
): OutboxSync {
  const { kind, send, lockName } = channel;
  const [count, setCount] = useState(() => ({ userId, value: readCount(kind, userId) }));
  const pendingCount = count.userId === userId ? count.value : readCount(kind, userId);
  const onResultRef = useRef(onResult);
  useLayoutEffect(() => {
    onResultRef.current = onResult;
  });
  const inFlight = useRef<Promise<void> | null>(null);

  const refreshCount = useCallback(() => setCount({ userId, value: readCount(kind, userId) }), [kind, userId]);

  useEffect(() => {
    refreshCount();
    if (!userId) return;
    const key = `${kind.keyPrefix}${userId}`;
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (!detail || detail.key === key) refreshCount();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) refreshCount();
    };
    window.addEventListener(OUTBOX_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(OUTBOX_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [kind, userId, refreshCount]);

  const run = useCallback(
    (force: boolean): Promise<void> => {
      if (!client || !userId) return Promise.resolve();
      if (inFlight.current) return inFlight.current;
      const drain = async () => {
        const outbox = openOutbox(kind, userId);
        for (const entry of outbox.prune()) {
          if (!force && entry.nextAttemptAt > Date.now()) break; // FIFO: never overtake a waiting entry
          const key = entry.args.p_idempotency_key;
          try {
            const result = await send(client, entry.args);
            outbox.remove(key);
            onResultRef.current(key, { result }, entry);
          } catch (error) {
            if (isRetryableOutboxError(error)) {
              outbox.markFailed(key);
              break;
            }
            outbox.remove(key);
            onResultRef.current(key, { error }, entry);
          }
        }
      };
      const locks = lockManager();
      const promise = (locks ? locks.request(lockName, drain) : drain()).catch(() => undefined);
      inFlight.current = promise.finally(() => {
        inFlight.current = null;
      });
      return inFlight.current;
    },
    [client, userId, kind, send, lockName],
  );

  const flush = useCallback(() => run(true), [run]);

  useEffect(() => {
    void run(true);
    const onOnline = () => void run(true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void run(true);
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [run]);

  useEffect(() => {
    if (pendingCount === 0) return;
    const timer = window.setInterval(() => void run(false), OUTBOX_SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [pendingCount, run]);

  return { pendingCount, flush };
}

/** Replays the lesson outbox (spec 2 §7.4). */
export function useOutboxSync(
  client: AppSupabaseClient | null,
  userId: string | null | undefined,
  onResult: OutboxResultHandler,
): OutboxSync {
  return useOutboxChannelSync(LESSON_OUTBOX_CHANNEL, client, userId, onResult);
}
