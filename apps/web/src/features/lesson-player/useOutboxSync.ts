import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SubmitArgs, SubmitResult } from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';
import {
  drainLessonOutbox,
  type LessonDropInfo,
  type LessonRunEvent,
} from './lesson-sync';
import { openLessonOps } from './offline-queue';
import {
  LESSON_OUTBOX,
  OUTBOX_CHANGE_EVENT,
  OUTBOX_ENQUEUED_EVENT,
  countExpiringSoon,
  createOutbox,
  openOutbox,
  type IdempotentArgs,
  type OutboxEntry,
  type OutboxEntryOf,
  type OutboxKind,
} from './outbox';
import { classifyOutboxError, errorMessageOf, isRetryableOutboxError, RATE_LIMIT_DELAY_MS } from './outbox-errors';
import { submitExercise } from './service';

export { isRetryableOutboxError };

export const OUTBOX_SYNC_INTERVAL_MS = 15_000;

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

/** The spec 2 lesson channel (submit_exercise). Its run start/completion entries are replayed by `useOutboxSync`. */
export const LESSON_OUTBOX_CHANNEL: OutboxChannel<SubmitArgs, SubmitResult> = {
  kind: LESSON_OUTBOX,
  send: submitExercise,
  lockName: 'linguo-outbox',
};

export interface OutboxSync {
  pendingCount: number;
  /** Sends every queued entry now (ignoring backoff), oldest first. */
  flush: () => Promise<void>;
  /** At least one queued entry has already failed to send (it is retried with backoff). */
  failing: boolean;
  /** A drain is running right now. */
  syncing: boolean;
  /** Queued entries older than 5 days: they are dropped after 7. */
  expiringCount: number;
}

export interface LessonOutboxSync extends OutboxSync {
  /** Queued entries per run id that must reach the server before the run can complete: its start and its answers. */
  pendingByRun: Record<string, number>;
  /** Run ids with a `complete_lesson` waiting in the outbox. */
  completingRuns: string[];
}

export interface OutboxSyncOptions {
  /** Work the server refused for good (or that expired): the provider reports it and tells the learner. */
  onDropped?: (info: LessonDropInfo) => void;
  /** Lesson run lifecycle events from the replay (started, remapped, completed, dropped). */
  onRunEvent?: (event: LessonRunEvent) => void;
}

interface LockManagerLike {
  request: (name: string, callback: () => Promise<void>) => Promise<void>;
}

function lockManager(): LockManagerLike | null {
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === 'function' ? locks : null;
}

interface Snapshot {
  count: number;
  failing: boolean;
  expiring: number;
  byRun: Record<string, number>;
  completing: string[];
}

const EMPTY_SNAPSHOT: Snapshot = { count: 0, failing: false, expiring: 0, byRun: {}, completing: [] };

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return (
    a.count === b.count &&
    a.failing === b.failing &&
    a.expiring === b.expiring &&
    JSON.stringify(a.byRun) === JSON.stringify(b.byRun) &&
    a.completing.join() === b.completing.join()
  );
}

function readChannelSnapshot<A extends IdempotentArgs>(kind: OutboxKind<A>, userId: string | null | undefined): Snapshot {
  if (!userId) return EMPTY_SNAPSHOT;
  const entries = openOutbox(kind, userId).list();
  return { ...EMPTY_SNAPSHOT, count: entries.length, failing: entries.some((e) => e.tries > 0), expiring: countExpiringSoon(entries) };
}

function readLessonSnapshot(userId: string | null | undefined): Snapshot {
  if (!userId) return EMPTY_SNAPSHOT;
  const answers = createOutbox(userId).list();
  const ops = openLessonOps(userId).list();
  const byRun: Record<string, number> = {};
  for (const e of answers) byRun[e.args.p_run_id] = (byRun[e.args.p_run_id] ?? 0) + 1;
  for (const e of ops) if (e.args.op === 'start') byRun[e.args.p_run_id] = (byRun[e.args.p_run_id] ?? 0) + 1;
  return {
    count: answers.length + ops.length,
    failing: answers.some((e) => e.tries > 0) || ops.some((e) => e.tries > 0),
    expiring: countExpiringSoon(answers) + countExpiringSoon(ops),
    byRun,
    completing: ops.filter((e) => e.args.op === 'complete').map((e) => e.args.p_run_id),
  };
}

interface EngineOptions {
  client: AppSupabaseClient | null;
  userId: string | null | undefined;
  lockName: string;
  /** Storage keys of every store this engine drains (counts refresh when one of them changes). */
  storageKeys: string[];
  read: () => Snapshot;
  /** One pass over the queue; resolves with the time to come back at when a rate limit asks for a pause. */
  drain: (client: AppSupabaseClient, userId: string, force: boolean) => Promise<{ wakeAt: number | null } | void>;
  /** Run a pass as soon as something that should go out soon is queued (lesson start/completion). */
  drainOnEnqueue?: boolean;
}

/**
 * The shared machinery: replays the queue on mount, when the browser comes online, when the tab becomes visible and
 * every 15 s while entries remain, one pass at a time and serialised across tabs with navigator.locks when available.
 * `drain`, `read` and `storageKeys` must be stable.
 */
function useOutboxEngine({ client, userId, lockName, storageKeys, read, drain, drainOnEnqueue = false }: EngineOptions) {
  const [state, setState] = useState(() => ({ userId, snap: read() }));
  const snap = state.userId === userId ? state.snap : read();
  const [syncing, setSyncing] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);
  /** A forced replay (online, tab visible, Sync now) asked for while a pass was running: repeat once it ends. */
  const rerunForced = useRef(false);
  const wakeTimer = useRef<number | undefined>(undefined);
  const runRef = useRef<(force: boolean) => Promise<void>>(() => Promise.resolve());
  // The client is read through a ref so a caller that hands out a new object each render cannot re-trigger the replay.
  const clientRef = useRef(client);
  useLayoutEffect(() => {
    clientRef.current = client;
  });
  const hasClient = client !== null;

  const refresh = useCallback(() => {
    const next = read();
    setState((prev) => (prev.userId === userId && sameSnapshot(prev.snap, next) ? prev : { userId, snap: next }));
  }, [read, userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (!detail || !detail.key || storageKeys.includes(detail.key)) refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || storageKeys.includes(event.key)) refresh();
    };
    window.addEventListener(OUTBOX_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(OUTBOX_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId, storageKeys, refresh]);

  const run = useCallback(
    (force: boolean): Promise<void> => {
      const current = clientRef.current;
      if (!current || !userId) return Promise.resolve();
      // A browser that says it is offline is right: nothing would get through, so do not burn a request (or a timeout).
      if (navigator.onLine === false) return Promise.resolve();
      if (inFlight.current) {
        if (force) rerunForced.current = true;
        return inFlight.current;
      }
      const task = async () => {
        setSyncing(true);
        try {
          const report = await drain(current, userId, force);
          window.clearTimeout(wakeTimer.current);
          if (report && report.wakeAt !== null) {
            // A rate limit asked for a pause: come back right after it instead of waiting for the next tick.
            wakeTimer.current = window.setTimeout(() => void runRef.current(false), Math.max(report.wakeAt - Date.now(), 250));
          }
        } finally {
          setSyncing(false);
        }
      };
      const locks = lockManager();
      const promise = (locks ? locks.request(lockName, task) : task()).catch(() => undefined);
      inFlight.current = promise.finally(() => {
        inFlight.current = null;
        if (rerunForced.current) {
          rerunForced.current = false;
          void runRef.current(true);
        }
      });
      return inFlight.current;
    },
    [hasClient, userId, lockName, drain],
  );

  useLayoutEffect(() => {
    runRef.current = run;
  }, [run]);

  const flush = useCallback(() => run(true), [run]);

  useEffect(() => {
    void run(true);
    const onOnline = () => void run(true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void run(true);
    };
    const onEnqueued = () => {
      if (drainOnEnqueue && navigator.onLine !== false) void run(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener(OUTBOX_ENQUEUED_EVENT, onEnqueued);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener(OUTBOX_ENQUEUED_EVENT, onEnqueued);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(wakeTimer.current);
    };
  }, [run, drainOnEnqueue]);

  const pendingCount = snap.count;
  useEffect(() => {
    if (pendingCount === 0) return;
    const timer = window.setInterval(() => void run(false), OUTBOX_SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [pendingCount, run]);

  return { snap, flush, syncing };
}

/**
 * Replays one outbox kind FIFO (reviews, personal vocabulary). A rejected entry is dropped and reported; a transient
 * failure keeps it with backoff and stops the pass; a rate limit pauses ~11 s and the pass resumes by itself.
 * `channel` must be a stable (module-level) object.
 */
export function useOutboxChannelSync<A extends IdempotentArgs, R>(
  channel: OutboxChannel<A, R>,
  client: AppSupabaseClient | null,
  userId: string | null | undefined,
  onResult: OutboxResultHandlerOf<A, R>,
  options: Pick<OutboxSyncOptions, 'onDropped'> = {},
): OutboxSync {
  const { kind, send, lockName } = channel;
  const onResultRef = useRef(onResult);
  const onDroppedRef = useRef(options.onDropped);
  useLayoutEffect(() => {
    onResultRef.current = onResult;
    onDroppedRef.current = options.onDropped;
  });
  const storageKeys = useStableKeys(userId ? [`${kind.keyPrefix}${userId}`] : []);
  const read = useCallback(() => readChannelSnapshot(kind, userId), [kind, userId]);

  const drain = useCallback(
    async (c: AppSupabaseClient, uid: string, force: boolean) => {
      const outbox = openOutbox(kind, uid);
      const { left, expired } = outbox.pruneExpired();
      if (expired.length > 0) onDroppedRef.current?.({ reason: 'expired', count: expired.length });
      let wakeAt: number | null = null;
      for (const entry of left) {
        if (!force && entry.nextAttemptAt > Date.now()) break; // FIFO: never overtake a waiting entry
        const key = entry.args.p_idempotency_key;
        try {
          const result = await send(c, entry.args);
          outbox.remove(key);
          onResultRef.current(key, { result }, entry);
        } catch (error) {
          const failure = classifyOutboxError(error);
          if (failure === 'rate_limited') {
            outbox.markFailed(key, Date.now(), RATE_LIMIT_DELAY_MS);
            wakeAt = Date.now() + RATE_LIMIT_DELAY_MS;
            break;
          }
          if (failure !== 'permanent') {
            outbox.markFailed(key);
            break;
          }
          outbox.remove(key);
          onResultRef.current(key, { error }, entry);
          onDroppedRef.current?.({ reason: errorMessageOf(error) ?? 'rejected', count: 1 });
        }
      }
      return { wakeAt };
    },
    [kind, send],
  );

  const { snap, flush, syncing } = useOutboxEngine({ client, userId, lockName, storageKeys, read, drain });
  return { pendingCount: snap.count, flush, failing: snap.failing, syncing, expiringCount: snap.expiring };
}

/** A key list that keeps its identity while its contents stay the same. */
function useStableKeys(keys: string[]): string[] {
  const joined = keys.join('\n');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `joined` is the identity of `keys`
  return useMemo(() => keys, [joined]);
}

/**
 * Replays the lesson outbox (spec 2 §7.4): the answers and the run start/completion entries, in order per run
 * (start -> answers -> completion). `onResult` receives each replayed answer; run lifecycle events and dropped work go
 * to `options`.
 */
export function useOutboxSync(
  client: AppSupabaseClient | null,
  userId: string | null | undefined,
  onResult: OutboxResultHandler,
  options: OutboxSyncOptions = {},
): LessonOutboxSync {
  const onResultRef = useRef(onResult);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    onResultRef.current = onResult;
    optionsRef.current = options;
  });
  const storageKeys = useStableKeys(userId ? [`${LESSON_OUTBOX.keyPrefix}${userId}`, openLessonOps(userId).key] : []);
  const read = useCallback(() => readLessonSnapshot(userId), [userId]);

  const drain = useCallback(
    (c: AppSupabaseClient, uid: string, force: boolean) =>
      drainLessonOutbox(c, uid, force, {
        onResult: (key, outcome, entry) => onResultRef.current(key, outcome, entry),
        onRunEvent: (event) => optionsRef.current.onRunEvent?.(event),
        onDropped: (info) => optionsRef.current.onDropped?.(info),
      }),
    [],
  );

  const { snap, flush, syncing } = useOutboxEngine({ client, userId, lockName: LESSON_OUTBOX_CHANNEL.lockName, storageKeys, read, drain, drainOnEnqueue: true });
  return {
    pendingCount: snap.count,
    flush,
    failing: snap.failing,
    syncing,
    expiringCount: snap.expiring,
    pendingByRun: snap.byRun,
    completingRuns: snap.completing,
  };
}
