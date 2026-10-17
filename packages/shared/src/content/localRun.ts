import {
  DEFAULT_RUBRIC,
  isGiveUp,
  responseSchemaFor,
  type ExerciseAnswer,
  type ExerciseResponse,
  type KnownWrong,
  type Rubric,
} from './exercises';
import { gradeResponse } from './grading';
import type {
  CompleteResult,
  LessonAttempt,
  LessonPayload,
  LessonRun,
  OfflineKey,
  OfflinePack,
  PublicExercise,
  SubmitResult,
} from './rpc';

// Offline lesson runs. The device holds a lesson pack (public payload + answer keys), grades locally with
// gradeResponse and keeps the run state here; the answers are queued and the server re-grades every one (its result
// is authoritative; a local verdict never grants XP). Everything below mirrors the SQL of
// 20261014000200_lesson_runs.sql (submit_exercise, complete_lesson, lesson_run_sync), as patched later:
//   attempt_no   = prior attempts of the exercise in this run + 1
//   after_reveal = an earlier attempt of the exercise revealed the answer
//   revealed     = verdict is not incorrect, OR attempt_no >= 2, OR the learner gave up
//   final        = verdict is not incorrect OR revealed
//   requeued     = not after_reveal AND verdict is incorrect AND revealed  (appends the exercise to the queue)
//   score        = 1 / 0.8 / 0 by verdict

const STAGE_ORDER = ['recognition', 'recall', 'application'] as const;

export type LocalRunErrorCode =
  | 'run_not_active'
  | 'exercise_not_in_lesson'
  | 'exercise_version_mismatch'
  | 'invalid_response'
  | 'attempts_incomplete'
  | 'idempotency_conflict';

/** Same codes the server raises, so the lesson error map (lessonErrorMessage) already has a message for each. */
export class LocalRunError extends Error {
  readonly code: LocalRunErrorCode;
  constructor(code: LocalRunErrorCode) {
    super(code);
    this.name = 'LocalRunError';
    this.code = code;
  }
}

/** One answer given on the device: the stored attempt (server shape) plus what a replay and the summary need. */
export interface LocalAttempt extends LessonAttempt {
  /** The idempotency key the queued submit_exercise carries; also this attempt's attempt_id until the server answers. */
  idempotency_key: string;
  exercise_version: number;
  stage: (typeof STAGE_ORDER)[number];
  confidence: 1 | 2 | 3 | null;
  gave_up: boolean;
  /** Hash of the answer (exercise + response), to detect a key reused with another payload like the server does. */
  response_fingerprint: string;
}

export interface LocalRun {
  id: string;
  lesson_id: string;
  path_id: string;
  content_version: number;
  status: 'in_progress' | 'completed';
  cursor: number;
  /** Exercise ids in play order; re-check entries are appended (an id may appear twice). */
  queue: string[];
  started_at: string;
  completed_at: string | null;
  next_review_at: string | null;
  summary: CompleteResult | null;
  attempts: LocalAttempt[];
}

/** Published exercises of a pack in the order start_lesson queues them: stage, then order_index. */
export function packQueue(pack: Pick<OfflinePack, 'exercises'>): string[] {
  return [...pack.exercises]
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.order_index - b.order_index)
    .map((e) => e.id);
}

export function startLocalRun(input: { id: string; pathId: string; pack: Pick<OfflinePack, 'lesson' | 'exercises'>; now: string }): LocalRun {
  return {
    id: input.id,
    lesson_id: input.pack.lesson.id,
    path_id: input.pathId,
    content_version: input.pack.lesson.content_version,
    status: 'in_progress',
    cursor: 0,
    queue: packQueue(input.pack),
    started_at: input.now,
    completed_at: null,
    next_review_at: null,
    summary: null,
    attempts: [],
  };
}

/** The run as lessonRunSchema (what start_lesson returns). */
export function localRunToLessonRun(run: LocalRun): LessonRun {
  return {
    id: run.id,
    status: run.status,
    cursor: run.cursor,
    queue: run.queue,
    next_review_at: run.next_review_at,
    summary: run.summary ? { ...run.summary } : null,
  };
}

/** The lesson payload the player renders, built from a pack and a local run (get_lesson's shape). */
export function localRunToPayload(pack: Pick<OfflinePack, 'lesson' | 'items' | 'exercises'>, run: LocalRun): LessonPayload {
  return {
    lesson: pack.lesson,
    items: pack.items,
    exercises: pack.exercises,
    run: localRunToLessonRun(run),
    attempts: run.attempts.map(toLessonAttempt),
  };
}

function toLessonAttempt(a: LocalAttempt): LessonAttempt {
  return {
    attempt_id: a.attempt_id,
    attempt_no: a.attempt_no,
    verdict: a.verdict,
    is_correct: a.is_correct,
    score: a.score,
    error_tags: a.error_tags,
    feedback_vi: a.feedback_vi,
    revealed: a.revealed,
    // get_lesson omits the answer fields of an attempt that did not reveal the answer.
    display_answer: a.revealed ? a.display_answer : null,
    explanation: a.revealed ? a.explanation : null,
    final: a.final,
    requeued: a.requeued,
    exercise_id: a.exercise_id,
    after_reveal: a.after_reveal,
    created_at: a.created_at,
  };
}

function fingerprint(exerciseId: string, version: number, response: ExerciseResponse): string {
  // Not a security hash: only equality of (exercise, version, response) matters. Keys sorted so key order never matters.
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, x]) => [k, canon(x)]),
          )
        : v;
  return JSON.stringify([exerciseId, version, canon(response)]);
}

function asResult(a: LocalAttempt, replayed: boolean): SubmitResult {
  return {
    attempt_id: a.attempt_id,
    attempt_no: a.attempt_no,
    verdict: a.verdict,
    is_correct: a.is_correct,
    score: a.score,
    error_tags: a.error_tags,
    feedback_vi: a.feedback_vi,
    revealed: a.revealed,
    display_answer: a.revealed ? a.display_answer : null,
    explanation: a.revealed ? a.explanation : null,
    final: a.final,
    requeued: a.requeued,
    replayed,
  };
}

export interface LocalAnswerInput {
  exercise: PublicExercise;
  key: OfflineKey;
  response: ExerciseResponse;
  confidence: 1 | 2 | 3 | null;
  /** Fresh uuid of this answer; the queued submit_exercise carries the same key. */
  idempotencyKey: string;
  /** ISO time the learner answered. */
  clientAt: string;
}

/**
 * Grades one answer with the shipped key and records it. Replaying the same idempotency key with the same answer
 * returns the stored result (`replayed: true`); another answer under that key is `idempotency_conflict`. Throws a
 * LocalRunError with the server's error codes for a closed run, an exercise outside the run's queue, a key of another
 * version, or a response of the wrong shape.
 */
export function applyLocalAttempt(run: LocalRun, input: LocalAnswerInput): { run: LocalRun; result: SubmitResult; attempt: LocalAttempt } {
  const { exercise, key, response } = input;
  const fp = fingerprint(exercise.id, exercise.version, response);
  const prior = run.attempts.find((a) => a.idempotency_key === input.idempotencyKey);
  if (prior) {
    if (prior.response_fingerprint !== fp) throw new LocalRunError('idempotency_conflict');
    return { run, result: asResult(prior, true), attempt: prior };
  }
  if (run.status !== 'in_progress') throw new LocalRunError('run_not_active');
  if (!run.queue.includes(exercise.id)) throw new LocalRunError('exercise_not_in_lesson');
  if (key.exercise_id !== exercise.id || key.version !== exercise.version) throw new LocalRunError('exercise_version_mismatch');
  if (!responseSchemaFor(exercise.type).safeParse(response).success) throw new LocalRunError('invalid_response');

  const grade = gradeResponse(
    {
      type: exercise.type,
      answer: key.answer_key as unknown as ExerciseAnswer,
      rubric: { ...DEFAULT_RUBRIC, ...(key.rubric as Partial<Rubric>) },
      knownWrong: key.known_wrong as KnownWrong[],
      lang: exercise.answer_lang,
    },
    response,
  );

  const earlier = run.attempts.filter((a) => a.exercise_id === exercise.id);
  const attemptNo = earlier.length + 1;
  const afterReveal = earlier.some((a) => a.revealed);
  const gaveUp = isGiveUp(response);
  const revealed = grade.verdict !== 'incorrect' || attemptNo >= 2 || gaveUp;
  const final = grade.verdict !== 'incorrect' || revealed;
  const requeued = !afterReveal && grade.verdict === 'incorrect' && revealed;

  const attempt: LocalAttempt = {
    attempt_id: input.idempotencyKey,
    attempt_no: attemptNo,
    verdict: grade.verdict,
    is_correct: grade.verdict !== 'incorrect',
    score: grade.score,
    error_tags: grade.errorTags,
    feedback_vi: grade.feedbackVi,
    revealed,
    display_answer: key.display_answer,
    explanation: key.explanation,
    final,
    requeued,
    exercise_id: exercise.id,
    after_reveal: afterReveal,
    created_at: input.clientAt,
    idempotency_key: input.idempotencyKey,
    exercise_version: exercise.version,
    stage: exercise.stage,
    confidence: input.confidence,
    gave_up: gaveUp,
    response_fingerprint: fp,
  };
  const next: LocalRun = {
    ...run,
    queue: requeued ? [...run.queue, exercise.id] : run.queue,
    attempts: [...run.attempts, attempt],
  };
  return { run: next, result: asResult(attempt, false), attempt };
}

/** Moves the saved cursor forward (it only ever increases, like save_lesson_cursor). */
export function advanceLocalCursor(run: LocalRun, cursor: number): LocalRun {
  return cursor > run.cursor ? { ...run, cursor } : run;
}

/**
 * complete_lesson's check: every distinct queue entry whose exercise is published (here: every exercise of the pack)
 * has a final attempt (not incorrect, or revealed), and every exercise revealed after a first-pass wrong answer has been
 * re-checked. Returns the ids still lacking a result.
 */
export function unresolvedExerciseIds(run: LocalRun, publishedIds: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const id of new Set(run.queue)) {
    if (!publishedIds.has(id)) continue;
    const mine = run.attempts.filter((a) => a.exercise_id === id);
    const resolved = mine.some((a) => a.verdict !== 'incorrect' || a.revealed);
    const needsRecheck = mine.some((a) => a.verdict === 'incorrect' && a.revealed && !a.after_reveal) && !mine.some((a) => a.after_reveal);
    if (!resolved || needsRecheck) out.push(id);
  }
  return out;
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;

/** Local instant of the next local midnight in `timeZone` (what the server stores as next_review_at). */
export function nextLocalMidnight(now: Date, timeZone: string): Date {
  const parts = (d: Date) => {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(d);
    const n = (type: string) => Number(f.find((p) => p.type === type)?.value);
    return { y: n('year'), m: n('month'), d: n('day'), h: n('hour'), mi: n('minute'), s: n('second') };
  };
  const offsetAt = (d: Date) => {
    const p = parts(d);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000;
  };
  const today = parts(now);
  const wall = Date.UTC(today.y, today.m - 1, today.d + 1, 0, 0, 0);
  let instant = wall - offsetAt(new Date(wall));
  // A DST change between the guess and the target shifts the offset: settle on the second pass.
  instant = wall - offsetAt(new Date(instant));
  return new Date(instant);
}

export type LocalSummary = { ok: true; summary: CompleteResult } | { ok: false; error: 'attempts_incomplete' };

/** complete_lesson computed on the device (same accuracy / signal rules; next_review_at is the learner's next local midnight). */
export function summarizeLocalRun(
  run: LocalRun,
  options: { publishedIds: ReadonlySet<string>; now: Date; timeZone: string },
): LocalSummary {
  if (run.status === 'completed' && run.summary) return { ok: true, summary: run.summary };
  if (unresolvedExerciseIds(run, options.publishedIds).length > 0) return { ok: false, error: 'attempts_incomplete' };

  const first = run.attempts.filter((a) => a.attempt_no === 1);
  const accuracy = (stage: (typeof STAGE_ORDER)[number]) => {
    const rows = first.filter((a) => a.stage === stage);
    return rows.length === 0 ? null : round4(rows.filter((a) => a.is_correct).length / rows.length);
  };
  const beforeReveal = run.attempts.filter((a) => !a.after_reveal);
  return {
    ok: true,
    summary: {
      accuracy_by_stage: { recognition: accuracy('recognition'), recall: accuracy('recall'), application: accuracy('application') },
      almost_count: beforeReveal.filter((a) => a.verdict === 'almost').length,
      confident_wrong: beforeReveal.filter((a) => a.confidence === 3 && a.verdict === 'incorrect').length,
      unsure_right: beforeReveal.filter((a) => a.confidence === 1 && a.is_correct).length,
      next_review_at: nextLocalMidnight(options.now, options.timeZone).toISOString(),
      completed_at: options.now.toISOString(),
    },
  };
}

/** Marks the run completed with a summary computed by summarizeLocalRun. */
export function completeLocalRun(run: LocalRun, summary: CompleteResult): LocalRun {
  if (run.status === 'completed') return run;
  return { ...run, status: 'completed', completed_at: summary.completed_at, next_review_at: summary.next_review_at, summary };
}

/**
 * lesson_run_sync on the device: when the pack changed under an open run (content_version differs), entries whose
 * exercise is no longer in the pack are dropped (re-check duplicates included), the survivors keep their order and
 * new exercises are appended in stage / order_index order. Attempts are kept; completed runs are returned as is.
 */
export function syncLocalRunToPack(run: LocalRun, pack: Pick<OfflinePack, 'lesson' | 'exercises'>): LocalRun {
  if (run.status !== 'in_progress' || run.content_version === pack.lesson.content_version) return run;
  const published = new Set(pack.exercises.map((e) => e.id));
  const kept = run.queue.filter((id) => published.has(id));
  const have = new Set(run.queue);
  const added = packQueue(pack).filter((id) => !have.has(id));
  return { ...run, content_version: pack.lesson.content_version, queue: [...kept, ...added] };
}
