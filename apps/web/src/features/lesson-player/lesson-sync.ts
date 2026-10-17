import type { CompleteResult, SubmitResult } from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';
import { classifyOutboxError, errorMessageOf, isRunLevelError, RATE_LIMIT_DELAY_MS } from './outbox-errors';
import {
  openLessonOps,
  sendLessonCompletion,
  sendLessonStart,
  type CompleteOpArgs,
  type LessonOpEntry,
  type StartOpArgs,
} from './offline-queue';
import { createOutbox, type OutboxEntry } from './outbox';
import { submitExercise } from './service';

/** What a replayed lesson submit reports to the screen that asked for it (unchanged since spec 2). */
export type LessonOutcome = { result: SubmitResult } | { error: unknown };

export type LessonRunEvent =
  | { type: 'started'; runId: string; serverRunId: string }
  /** The server already held an open run for that lesson: the queued answers/completion now point at `to`. */
  | { type: 'remapped'; from: string; to: string }
  | { type: 'completed'; runId: string; result: CompleteResult }
  | { type: 'complete_failed'; runId: string; error: unknown }
  /** The run (start, answers, completion) was refused for good and removed from the queue. */
  | { type: 'dropped'; runId: string; reason: string };

export interface LessonDropInfo {
  reason: string;
  count: number;
  runId?: string;
}

export interface LessonDrainHooks {
  onResult: (idempotencyKey: string, outcome: LessonOutcome, entry: OutboxEntry) => void;
  onRunEvent: (event: LessonRunEvent) => void;
  onDropped: (info: LessonDropInfo) => void;
}

export interface DrainReport {
  /** When to run again earlier than the polling interval (after a rate limit), ms epoch, or null. */
  wakeAt: number | null;
}

type RunOutcome = 'done' | 'blocked' | 'stop';

/**
 * Replays the lesson outbox (answers in `linguo-outbox-v1`, run start/completion in `linguo-lesson-ops-v1`).
 * Order is per run: start -> answers (FIFO) -> completion. A run that is waiting (backoff, refused entry) never holds
 * back other runs; a failure that says the network or the server is unavailable (offline, 5xx, rate limit, expired
 * token) stops the whole pass, since the next entries would fail the same way.
 * The caller holds the cross-tab lock.
 */
export async function drainLessonOutbox(
  client: AppSupabaseClient,
  userId: string,
  force: boolean,
  hooks: LessonDrainHooks,
  now: () => number = Date.now,
): Promise<DrainReport> {
  const submits = createOutbox(userId);
  const ops = openLessonOps(userId);
  let wakeAt: number | null = null;
  const wakeBy = (at: number) => {
    wakeAt = wakeAt === null ? at : Math.min(wakeAt, at);
  };

  const isDue = (entry: { nextAttemptAt: number }): boolean => {
    return force || entry.nextAttemptAt <= now();
  };

  // Entries that sat unsent for 7 days are dropped; say so instead of losing them silently.
  const expiredAnswers = submits.pruneExpired().expired;
  const expiredOps = ops.pruneExpired().expired;
  if (expiredAnswers.length + expiredOps.length > 0) {
    hooks.onDropped({ reason: 'expired', count: expiredAnswers.length + expiredOps.length });
  }

  const dropRun = (runId: string, reason: string, error: unknown): void => {
    const answers = submits.removeWhere((e) => e.args.p_run_id === runId);
    const control = ops.removeWhere((e) => e.args.p_run_id === runId);
    for (const entry of answers) hooks.onResult(entry.args.p_idempotency_key, { error }, entry);
    hooks.onDropped({ reason, count: answers.length + control.length, runId });
    hooks.onRunEvent({ type: 'dropped', runId, reason });
  };

  const remap = (from: string, to: string): void => {
    submits.update((e) => (e.args.p_run_id === from ? { ...e, args: { ...e.args, p_run_id: to } } : e));
    ops.update((e) => (e.args.p_run_id === from ? ({ ...e, args: { ...e.args, p_run_id: to } } as LessonOpEntry) : e));
    hooks.onRunEvent({ type: 'remapped', from, to });
  };

  /** Applies a failed send. 'done' means the error is permanent and the caller must drop what it refused. */
  const fail = (error: unknown, entry: { args: { p_idempotency_key: string } }, store: 'answers' | 'ops'): RunOutcome => {
    const kind = classifyOutboxError(error);
    const target = store === 'answers' ? submits : ops;
    if (kind === 'waiting') return 'blocked';
    if (kind === 'rate_limited') {
      target.markFailed(entry.args.p_idempotency_key, now(), RATE_LIMIT_DELAY_MS);
      wakeBy(now() + RATE_LIMIT_DELAY_MS);
      return 'stop';
    }
    if (kind === 'retry') {
      target.markFailed(entry.args.p_idempotency_key, now());
      return 'stop';
    }
    return 'done';
  };

  const processRun = async (runId: string): Promise<RunOutcome> => {
    // 1. start (a run created on the device)
    const start = ops.list().find((e) => e.args.op === 'start' && e.args.p_run_id === runId);
    if (start) {
      if (!isDue(start)) return 'blocked';
      try {
        const run = await sendLessonStart(client, start.args as StartOpArgs);
        ops.remove(start.args.p_idempotency_key);
        hooks.onRunEvent({ type: 'started', runId, serverRunId: run.id });
        if (run.id !== runId) {
          remap(runId, run.id);
          return processRun(run.id);
        }
      } catch (error) {
        const outcome = fail(error, start, 'ops');
        if (outcome !== 'done') return outcome;
        dropRun(runId, errorMessageOf(error) ?? 'start_failed', error);
        return 'done';
      }
    }

    // 2. answers, oldest first
    for (const entry of submits.list().filter((e) => e.args.p_run_id === runId)) {
      if (!isDue(entry)) return 'blocked';
      const key = entry.args.p_idempotency_key;
      try {
        const result = await submitExercise(client, entry.args);
        submits.remove(key);
        hooks.onResult(key, { result }, entry);
      } catch (error) {
        const outcome = fail(error, entry, 'answers');
        if (outcome !== 'done') return outcome;
        if (isRunLevelError(error)) {
          dropRun(runId, errorMessageOf(error) ?? 'run_failed', error);
          return 'done';
        }
        submits.remove(key);
        hooks.onResult(key, { error }, entry);
        hooks.onDropped({ reason: errorMessageOf(error) ?? 'rejected', count: 1, runId });
      }
    }

    // 3. completion
    const complete = ops.list().find((e) => e.args.op === 'complete' && e.args.p_run_id === runId);
    if (complete) {
      if (!isDue(complete)) return 'blocked';
      try {
        const result = await sendLessonCompletion(client, userId, complete.args as CompleteOpArgs);
        ops.remove(complete.args.p_idempotency_key);
        hooks.onRunEvent({ type: 'completed', runId, result });
      } catch (error) {
        const outcome = fail(error, complete, 'ops');
        if (outcome !== 'done') return outcome;
        if (isRunLevelError(error)) {
          dropRun(runId, errorMessageOf(error) ?? 'run_failed', error);
        } else {
          ops.remove(complete.args.p_idempotency_key);
          hooks.onDropped({ reason: errorMessageOf(error) ?? 'rejected', count: 1, runId });
          hooks.onRunEvent({ type: 'complete_failed', runId, error });
        }
      }
    }
    return 'done';
  };

  const runOrder = [...ops.list(), ...submits.list()]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map((e) => e.args.p_run_id)
    .filter((id, i, all) => all.indexOf(id) === i);
  for (const runId of runOrder) {
    if ((await processRun(runId)) === 'stop') break;
  }
  return { wakeAt };
}
