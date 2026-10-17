import {
  localRunToPayload,
  startLocalRun,
  syncLocalRunToPack,
  type LessonAttempt,
  type LessonPayload,
  type LocalAttempt,
  type LocalRun,
  type OfflineKey,
  type OfflinePack,
  type PublicExercise,
} from '@linguo/shared';
import { getContentStore, type StoredRun } from '@/features/offline/content-store';
import { findLocalRun, removeLocalRun, saveLocalRun } from '@/features/offline/local-runs';
import { packIsComplete } from '@/features/offline/pack-service';
import { enqueueLessonStart, pendingEntriesForRun } from './offline-queue';

// Lessons studied from the device's own copy: the pack (public payload + answer keys) and a local run that is graded
// with gradeResponse, answered immediately, and replayed to the server by the outbox (which stays authoritative).

/** Everything the lesson screen needs to run a lesson without the server. */
export interface LocalCtx {
  run: LocalRun;
  /** 'device': the server does not know the run yet (its start is queued). 'server': it exists there already. */
  origin: StoredRun['origin'];
  pack: OfflinePack;
  keys: Map<string, OfflineKey>;
  exercises: Map<string, PublicExercise>;
  /** Exercise ids whose answers are checkable here (every published exercise of the pack). */
  publishedIds: Set<string>;
}

export interface Loaded {
  payload: LessonPayload;
  /** Set when the lesson runs from the device's copy. */
  local: LocalCtx | null;
}

export function buildLocalCtx(run: LocalRun, origin: StoredRun['origin'], pack: OfflinePack): LocalCtx {
  return {
    run,
    origin,
    pack,
    keys: new Map(pack.keys.map((k) => [k.exercise_id, k])),
    exercises: new Map(pack.exercises.map((e) => [e.id, e])),
    publishedIds: new Set(pack.exercises.map((e) => e.id)),
  };
}

export const loadedFromContext = (ctx: LocalCtx): Loaded => ({ payload: localRunToPayload(ctx.pack, ctx.run), local: ctx });

/** The pack of a lesson when it can be graded offline (keys present for every exercise), else null. */
async function readUsablePack(userId: string, lessonId: string): Promise<OfflinePack | null> {
  try {
    const store = await getContentStore(userId);
    const stored = await store.getPack(lessonId);
    if (!stored || !stored.meta.hasKeys || !packIsComplete(stored.pack)) return null;
    void store.touchPack(lessonId).catch(() => undefined);
    return stored.pack;
  } catch {
    return null;
  }
}

/**
 * The run the device holds for this lesson, when it is still the source of truth: its start, answers or completion have
 * not all reached the server (or the device is offline). A run the server has fully absorbed is dropped here and the
 * lesson loads from the server, so a normal online visit always shows the server's state.
 */
export async function openDeviceRun(userId: string, lessonId: string, pathId: string, online: boolean): Promise<Loaded | null> {
  const stored = await findLocalRun(userId, lessonId, pathId);
  if (!stored) return null;
  const pending = pendingEntriesForRun(userId, stored.run.id);
  if (online && pending === 0) {
    await removeLocalRun(userId, stored.run.id);
    return null;
  }
  const pack = await readUsablePack(userId, lessonId);
  if (!pack) return null;
  // The pack was refreshed after the run started: bring the run's queue in line (lesson_run_sync, on the device).
  const run = syncLocalRunToPack(stored.run, pack);
  if (run !== stored.run) await saveLocalRun(userId, { ...stored, run, updatedAt: Date.now() });
  return loadedFromContext(buildLocalCtx(run, stored.origin, pack));
}

/** Starts a run from the stored pack with no network: a fresh run id, its start queued for the server. Null without a usable pack. */
export async function startRunOnDevice(userId: string, lessonId: string, pathId: string, now: Date = new Date()): Promise<Loaded | null> {
  const pack = await readUsablePack(userId, lessonId);
  if (!pack) return null;
  const run = startLocalRun({ id: crypto.randomUUID(), pathId, pack, now: now.toISOString() });
  // The queue entry comes first: a run the server will never hear about must not exist on screen.
  if (!enqueueLessonStart(userId, { runId: run.id, lessonId, pathId, clientAt: run.started_at })) throw new Error('outbox_unavailable');
  await saveLocalRun(userId, { run, origin: 'device', updatedAt: now.getTime() });
  return loadedFromContext(buildLocalCtx(run, 'device', pack));
}

/** A server attempt as the local engine keeps it (the unknowns of an answer given elsewhere take neutral values). */
function adoptAttempt(a: LessonAttempt, exercise: PublicExercise | undefined): LocalAttempt {
  return {
    ...a,
    idempotency_key: a.attempt_id,
    exercise_version: exercise?.version ?? 1,
    stage: exercise?.stage ?? 'recognition',
    confidence: null,
    gave_up: false,
    response_fingerprint: '',
  };
}

/**
 * The network dropped in the middle of a lesson running from the server: carry on from the device's copy so the next
 * answers are graded at once. Only when the pack is the very version on screen (its keys then match what was served).
 */
export async function adoptServerRun(
  userId: string,
  pathId: string,
  payload: LessonPayload,
  attempts: readonly LessonAttempt[],
  run: { id: string; cursor: number; queue: string[] },
): Promise<LocalCtx | null> {
  const pack = await readUsablePack(userId, payload.lesson.id);
  if (!pack || pack.lesson.content_version !== payload.lesson.content_version) return null;
  const byId = new Map(pack.exercises.map((e) => [e.id, e]));
  const local: LocalRun = {
    id: run.id,
    lesson_id: payload.lesson.id,
    path_id: pathId,
    content_version: payload.lesson.content_version,
    status: 'in_progress',
    cursor: run.cursor,
    queue: [...run.queue],
    started_at: new Date().toISOString(),
    completed_at: null,
    next_review_at: null,
    summary: null,
    attempts: attempts.map((a) => adoptAttempt(a, byId.get(a.exercise_id))),
  };
  const ctx = buildLocalCtx(local, 'server', pack);
  await saveLocalRun(userId, { run: local, origin: 'server', updatedAt: Date.now() });
  return ctx;
}

/** Writes the run to the device; false when the disk refused it (the caller says so once). */
export function persistLocalRun(userId: string, ctx: LocalCtx): Promise<boolean> {
  return saveLocalRun(userId, { run: ctx.run, origin: ctx.origin, updatedAt: Date.now() });
}
