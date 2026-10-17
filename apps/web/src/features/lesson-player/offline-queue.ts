import { completeResultSchema, lessonRunSchema, type CompleteResult, type LessonRun } from '@linguo/shared';
import { z } from 'zod';
import type { AppSupabaseClient } from '@/lib/supabase';
import {
  OUTBOX_ENQUEUED_EVENT,
  createOutbox,
  openOutbox,
  type OutboxEntryOf,
  type OutboxKind,
  type OutboxOf,
} from './outbox';
import { callRpc, parse } from './service';

// Lesson-run control calls that must reach the server in order with the learner's answers: a run that was started
// on the device (offline) is created idempotently by `start_lesson(p_run_id)`, and `complete_lesson` closes it.
// The strict order per run is start -> submit_exercise entries (the lesson outbox) -> complete_lesson; it is enforced
// by the drain in `lesson-sync.ts`, not by queue position, so unrelated runs never block each other.

export const LESSON_OPS_KEY_PREFIX = 'linguo-lesson-ops-v1:';

export const startOpArgsSchema = z.object({
  op: z.literal('start'),
  /** `start:<runId>`: one start per run, so queueing it twice is a no-op. */
  p_idempotency_key: z.string().min(1),
  p_run_id: z.uuid(),
  p_lesson_id: z.uuid(),
  p_path_id: z.uuid(),
  p_client_at: z.string(),
});
export const completeOpArgsSchema = z.object({
  op: z.literal('complete'),
  /** `complete:<runId>` */
  p_idempotency_key: z.string().min(1),
  p_run_id: z.uuid(),
  p_client_at: z.string(),
});
export const lessonOpArgsSchema = z.discriminatedUnion('op', [startOpArgsSchema, completeOpArgsSchema]);

export type StartOpArgs = z.infer<typeof startOpArgsSchema>;
export type CompleteOpArgs = z.infer<typeof completeOpArgsSchema>;
export type LessonOpArgs = z.infer<typeof lessonOpArgsSchema>;
export type LessonOpEntry = OutboxEntryOf<LessonOpArgs>;

export const LESSON_OPS_OUTBOX: OutboxKind<LessonOpArgs> = {
  keyPrefix: LESSON_OPS_KEY_PREFIX,
  argsSchema: lessonOpArgsSchema as unknown as z.ZodType<LessonOpArgs>,
};

export function lessonOpsKey(userId: string): string {
  return `${LESSON_OPS_KEY_PREFIX}${userId}`;
}

export function openLessonOps(userId: string, storage?: Storage | null): OutboxOf<LessonOpArgs> {
  return storage === undefined ? openOutbox(LESSON_OPS_OUTBOX, userId) : openOutbox(LESSON_OPS_OUTBOX, userId, storage);
}

function announce(): void {
  try {
    window.dispatchEvent(new Event(OUTBOX_ENQUEUED_EVENT));
  } catch {
    // No window: the next interval tick drains it.
  }
}

export interface LessonStartRequest {
  /** The run id generated on the device; the server creates the run under it (or returns the existing open run). */
  runId: string;
  lessonId: string;
  pathId: string;
  /** When the learner opened the lesson (ISO). */
  clientAt: string;
}

/**
 * Queues `start_lesson(p_lesson_id, p_path_id, p_run_id, p_client_at)` for a run started on the device. Returns false
 * when it could not be persisted (storage full or blocked): the caller must not treat the run as syncable.
 * Queueing the same run twice is a no-op (true).
 */
export function enqueueLessonStart(userId: string, request: LessonStartRequest): boolean {
  const saved = openLessonOps(userId).add({
    queueIndex: 0,
    args: {
      op: 'start',
      p_idempotency_key: `start:${request.runId}`,
      p_run_id: request.runId,
      p_lesson_id: request.lessonId,
      p_path_id: request.pathId,
      p_client_at: request.clientAt,
    },
  });
  if (saved) announce();
  return saved;
}

/**
 * Queues `complete_lesson(p_run_id, p_client_at)` for a run completed on the device. The drain sends it only after
 * the run's start and every queued answer reached the server (until then it waits as `outbox_waiting`).
 */
export function enqueueLessonCompletion(userId: string, runId: string, clientAt: string = new Date().toISOString()): boolean {
  const saved = openLessonOps(userId).add({
    queueIndex: 0,
    args: { op: 'complete', p_idempotency_key: `complete:${runId}`, p_run_id: runId, p_client_at: clientAt },
  });
  if (saved) announce();
  return saved;
}

/** True when the lesson outbox holds a queued `complete_lesson` for the run. */
export function hasQueuedCompletion(userId: string, runId: string): boolean {
  return openLessonOps(userId)
    .list()
    .some((e) => e.args.op === 'complete' && e.args.p_run_id === runId);
}

/** Entries still waiting for the run: its start, answers and completion (the sync status for one run). */
export function pendingEntriesForRun(userId: string, runId: string): number {
  const answers = createOutbox(userId)
    .list()
    .filter((e) => e.args.p_run_id === runId).length;
  const ops = openLessonOps(userId)
    .list()
    .filter((e) => e.args.p_run_id === runId).length;
  return answers + ops;
}

// ---- sending ----------------------------------------------------------------------------------------------

/** `start_lesson` with the client run id; returns the run the server holds (its id differs when an open run already existed). */
export async function sendLessonStart(client: AppSupabaseClient, args: StartOpArgs): Promise<LessonRun> {
  return parse(
    lessonRunSchema,
    await callRpc(client, 'start_lesson', {
      p_lesson_id: args.p_lesson_id,
      p_path_id: args.p_path_id,
      p_run_id: args.p_run_id,
      p_client_at: args.p_client_at,
    }),
  );
}

/**
 * `complete_lesson`; refuses (retryable `outbox_waiting`) while an answer of the run is still queued, because the
 * server rejects a completion whose attempts are missing.
 */
export async function sendLessonCompletion(client: AppSupabaseClient, userId: string, args: CompleteOpArgs): Promise<CompleteResult> {
  if (createOutbox(userId).list().some((e) => e.args.p_run_id === args.p_run_id)) throw { message: 'outbox_waiting', code: '' };
  return parse(completeResultSchema, await callRpc(client, 'complete_lesson', { p_run_id: args.p_run_id, p_client_at: args.p_client_at }));
}

/** The queued lesson outbox ops of one run (`start` first). */
export function opsOfRun(entries: LessonOpEntry[], runId: string): LessonOpEntry[] {
  return entries.filter((e) => e.args.p_run_id === runId);
}
