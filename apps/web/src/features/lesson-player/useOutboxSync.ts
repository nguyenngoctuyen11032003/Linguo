import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SubmitResult } from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';
import { isNetworkError } from './error-map';
import { createOutbox, OUTBOX_CHANGE_EVENT, outboxKey, type OutboxEntry } from './outbox';
import { submitExercise } from './service';

export const OUTBOX_SYNC_INTERVAL_MS = 15_000;
const LOCK_NAME = 'linguo-outbox';
/** Server answers that are transient: keep the entry and retry later instead of dropping the learner's answer. */
const RETRYABLE_MESSAGES = new Set(['rate_limited', 'not_authenticated']);

export type OutboxOutcome = { result: SubmitResult } | { error: unknown };
export type OutboxResultHandler = (idempotencyKey: string, outcome: OutboxOutcome, entry: OutboxEntry) => void;

export interface OutboxSync {
  pendingCount: number;
  /** Sends every queued entry now (ignoring backoff), oldest first. */
  flush: () => Promise<void>;
}

function isRetryable(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  return !!error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && RETRYABLE_MESSAGES.has(error.message);
}

interface LockManagerLike {
  request: (name: string, callback: () => Promise<void>) => Promise<void>;
}

function lockManager(): LockManagerLike | null {
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === 'function' ? locks : null;
}

function readCount(userId: string | null | undefined): number {
  return userId ? createOutbox(userId).list().length : 0;
}

/**
 * Replays the offline outbox FIFO on mount, when the browser comes online, when the tab becomes visible and
 * every 15 s while entries remain. Tabs are serialised with navigator.locks when available.
 */
export function useOutboxSync(
  client: AppSupabaseClient | null,
  userId: string | null | undefined,
  onResult: OutboxResultHandler,
): OutboxSync {
  const [count, setCount] = useState(() => ({ userId, value: readCount(userId) }));
  const pendingCount = count.userId === userId ? count.value : readCount(userId);
  const onResultRef = useRef(onResult);
  useLayoutEffect(() => {
    onResultRef.current = onResult;
  });
  const inFlight = useRef<Promise<void> | null>(null);

  const refreshCount = useCallback(() => setCount({ userId, value: readCount(userId) }), [userId]);

  useEffect(() => {
    refreshCount();
    if (!userId) return;
    const key = outboxKey(userId);
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
  }, [userId, refreshCount]);

  const run = useCallback(
    (force: boolean): Promise<void> => {
      if (!client || !userId) return Promise.resolve();
      if (inFlight.current) return inFlight.current;
      const drain = async () => {
        const outbox = createOutbox(userId);
        for (const entry of outbox.prune()) {
          if (!force && entry.nextAttemptAt > Date.now()) break; // FIFO: never overtake a waiting entry
          const key = entry.args.p_idempotency_key;
          try {
            const result = await submitExercise(client, entry.args);
            outbox.remove(key);
            onResultRef.current(key, { result }, entry);
          } catch (error) {
            if (isRetryable(error)) {
              outbox.markFailed(key);
              break;
            }
            outbox.remove(key);
            onResultRef.current(key, { error }, entry);
          }
        }
      };
      const locks = lockManager();
      const promise = (locks ? locks.request(LOCK_NAME, drain) : drain()).catch(() => undefined);
      inFlight.current = promise.finally(() => {
        inFlight.current = null;
      });
      return inFlight.current;
    },
    [client, userId],
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
