import { z } from 'zod';
import type { AppSupabaseClient } from '@/lib/supabase';
import {
  exercisePromptSchema,
  learningItemSideSchema,
  lessonBlockSchema,
  lessonObjectiveSchema,
  localizedTextSchema,
  type ExercisePrompt,
  type LessonBlock,
  type LocalizedText,
} from './content-schemas';

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/** The request never reached Postgres (offline, DNS, timeout, gateway): safe to retry with the same idempotency key. */
export class NetworkError extends Error {
  readonly code = 'network_error';
  constructor(message = 'network_error', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'NetworkError';
  }
}

/** The RPC answered but its JSON does not match the contract in spec §6.3. */
export class InvalidServerResponseError extends Error {
  readonly code = 'invalid_server_response';
  constructor(rpc: string, options?: { cause?: unknown }) {
    super(`invalid_server_response:${rpc}`, options);
    this.name = 'InvalidServerResponseError';
  }
}

/**
 * Postgres and PostgREST errors always carry a code (SQLSTATE such as P0001, or PGRSTxxx). supabase-js turns a
 * fetch failure into `{ code: '', message: 'TypeError: …' }` instead of rejecting; a gateway error has no code
 * either. Both mean the database never decided anything.
 */
function isTransportError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) return true;
  if (error && typeof error === 'object') {
    const code = 'code' in error ? error.code : undefined;
    return code === undefined || code === null || code === '';
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Untyped RPC access — TODO(integration): drop once database.types.ts is regenerated with spec 2 RPCs.
// ---------------------------------------------------------------------------------------------

interface RpcBuilder extends PromiseLike<{ data: unknown; error: unknown }> {
  abortSignal?: (signal: AbortSignal) => RpcBuilder;
}
type UntypedRpc = (fn: string, args?: Record<string, unknown>) => RpcBuilder;

async function callRpc(
  client: AppSupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  options: { signal?: AbortSignal } = {},
): Promise<unknown> {
  let result: { data: unknown; error: unknown };
  try {
    let builder = (client.rpc as unknown as UntypedRpc).call(client, fn, args);
    if (options.signal && typeof builder.abortSignal === 'function') builder = builder.abortSignal(options.signal);
    result = await builder;
  } catch (error) {
    if (isTransportError(error)) throw new NetworkError(error instanceof Error ? error.message : 'network_error', { cause: error });
    throw error;
  }
  if (result.error) {
    if (isTransportError(result.error)) throw new NetworkError(errorMessage(result.error), { cause: result.error });
    throw result.error;
  }
  return result.data;
}

function errorMessage(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : 'network_error';
}

function parse<T extends z.ZodType>(schema: T, rpc: string, data: unknown): z.output<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new InvalidServerResponseError(rpc, { cause: parsed.error });
  return parsed.data;
}

// ---------------------------------------------------------------------------------------------
// Response schemas (spec §6.3, §3.5)
// ---------------------------------------------------------------------------------------------

const id = z.string().min(1);
const verdictSchema = z.enum(['correct', 'almost', 'incorrect']);
const stageSchema = z.enum(['recognition', 'recall', 'application']);
const exerciseTypeSchema = z.enum(['mcq', 'fill_blank', 'word_bank', 'translate', 'listen']);
const runStatusSchema = z.enum(['in_progress', 'completed']);

export type Verdict = z.infer<typeof verdictSchema>;
export type ExerciseStage = z.infer<typeof stageSchema>;
export type ExerciseType = z.infer<typeof exerciseTypeSchema>;

/** Stored per-attempt feedback; only ever present once the server has graded. */
const feedbackSchema = z.looseObject({
  feedback_vi: z.string().nullish(),
  error_tags: z.array(z.string()).nullish(),
  display_answer: z.string().nullish(),
  explanation: localizedTextSchema.nullish(),
});

/** Latest graded attempt of one exercise in a run, as returned inside `get_lesson` / `start_lesson`. */
const runAttemptSchema = z.looseObject({
  exercise_id: id,
  attempt_no: z.number().int().min(1),
  verdict: verdictSchema,
  is_correct: z.boolean(),
  revealed: z.boolean(),
  feedback_json: feedbackSchema.nullish(),
});

export const runStateSchema = z.looseObject({
  run_id: id,
  status: runStatusSchema,
  cursor: z.number().int().min(0),
  queue: z.array(id),
  attempts: z.array(runAttemptSchema).nullish(),
});

const learningItemSchema = z.looseObject({
  id,
  item_type: z.string(),
  front: learningItemSideSchema,
  back: learningItemSideSchema,
  audio_path: z.string().nullish(),
});

const exerciseSchema = z.looseObject({
  id,
  version: z.number().int().min(1),
  order_index: z.number().int(),
  exercise_type: exerciseTypeSchema,
  stage: stageSchema,
  answer_lang: z.enum(['en', 'ko', 'vi']),
  prompt: exercisePromptSchema,
  item_id: id.nullish(),
});

export const lessonPayloadSchema = z.looseObject({
  lesson: z.looseObject({
    id,
    language_code: z.enum(['en', 'ko']),
    level_code: z.string(),
    title: localizedTextSchema,
    objectives: z.array(lessonObjectiveSchema),
    body: z.array(lessonBlockSchema),
    estimated_minutes: z.number().int(),
    skills: z.array(z.string()).nullish(),
  }),
  content_version: z.number().int().min(1),
  is_demo: z.boolean(),
  items: z.array(learningItemSchema).nullish(),
  exercises: z.array(exerciseSchema),
  run: runStateSchema.nullish(),
});

const submitResultSchema = z.looseObject({
  attempt_id: id,
  attempt_no: z.number().int().min(1),
  verdict: verdictSchema,
  is_correct: z.boolean(),
  score: z.coerce.number(),
  error_tags: z.array(z.string()).nullish(),
  feedback_vi: z.string().nullish(),
  revealed: z.boolean(),
  display_answer: z.string().nullish(),
  explanation: localizedTextSchema.nullish(),
  requeued: z.boolean(),
  replayed: z.boolean(),
});

const summarySchema = z.looseObject({
  accuracy_by_stage: z.record(z.string(), z.number().nullable()),
  almost_count: z.number().int(),
  confident_wrong: z.number().int(),
  unsure_right: z.number().int(),
});

const completeResultSchema = z.preprocess(
  // The column is `summary_json`; accept either key so the RPC can return the row or a shaped object.
  (v) => (v && typeof v === 'object' && !('summary' in v) && 'summary_json' in v ? { ...v, summary: v.summary_json } : v),
  z.looseObject({
    run_id: id,
    next_review_at: z.string(),
    completed_at: z.string().nullish(),
    summary: summarySchema,
  }),
);

const pathLessonRowSchema = z.looseObject({
  lesson_id: id,
  unit: z.looseObject({ id, title: localizedTextSchema, order_index: z.number().int().nullish() }),
  program: z.looseObject({ id, title: localizedTextSchema, order_index: z.number().int().nullish() }),
  title: localizedTextSchema,
  level_code: z.string(),
  estimated_minutes: z.number().int(),
  is_demo: z.boolean(),
  prerequisites_met: z.boolean(),
  run_status: z.enum(['not_started', 'in_progress', 'completed']),
  prerequisites: z.array(z.looseObject({ lesson_id: id, title: localizedTextSchema })).nullish(),
});

// ---------------------------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------------------------

export interface Feedback {
  feedbackVi: string | null;
  errorTags: string[];
  displayAnswer: string | null;
  explanation: LocalizedText | null;
}

/** A server-confirmed grading. The player never builds one locally. */
export interface GradedAttempt {
  attemptNo: number;
  verdict: Verdict;
  isCorrect: boolean;
  revealed: boolean;
  feedback: Feedback;
}

export interface RunState {
  runId: string;
  status: 'in_progress' | 'completed';
  cursor: number;
  queue: string[];
  /** Latest graded attempt per exercise. */
  attempts: Record<string, GradedAttempt>;
}

export interface LearningItem {
  id: string;
  itemType: string;
  front: unknown;
  back: unknown;
  audioPath: string | null;
}

export interface Exercise {
  id: string;
  version: number;
  orderIndex: number;
  type: ExerciseType;
  stage: ExerciseStage;
  answerLang: 'en' | 'ko' | 'vi';
  prompt: ExercisePrompt;
  itemId: string | null;
}

export interface Lesson {
  id: string;
  languageCode: 'en' | 'ko';
  levelCode: string;
  title: LocalizedText;
  objectives: unknown[];
  body: LessonBlock[];
  estimatedMinutes: number;
  skills: string[];
  contentVersion: number;
  isDemo: boolean;
  items: LearningItem[];
  exercises: Exercise[];
}

export interface LessonPayload {
  lesson: Lesson;
  run: RunState | null;
}

export interface SubmitInput {
  runId: string;
  exerciseId: string;
  exerciseVersion: number;
  idempotencyKey: string;
  /** `{ give_up: true }` for "Xem đáp án". */
  response: unknown;
  confidence: 1 | 2 | 3 | null;
  responseMs: number;
  hintCount: number;
  /** ISO timestamp of the moment the learner pressed submit. */
  clientAt: string;
}

export interface SubmitResult extends GradedAttempt {
  attemptId: string;
  score: number;
  requeued: boolean;
  replayed: boolean;
}

export interface LessonSummary {
  accuracyByStage: Record<string, number | null>;
  almostCount: number;
  confidentWrong: number;
  unsureRight: number;
}

export interface CompleteResult {
  runId: string;
  nextReviewAt: string;
  completedAt: string | null;
  summary: LessonSummary;
}

export type LessonRunStatus = 'not_started' | 'in_progress' | 'completed';

export interface PathLesson {
  lessonId: string;
  unit: { id: string; title: LocalizedText; orderIndex: number | null };
  program: { id: string; title: LocalizedText; orderIndex: number | null };
  title: LocalizedText;
  levelCode: string;
  estimatedMinutes: number;
  isDemo: boolean;
  prerequisitesMet: boolean;
  runStatus: LessonRunStatus;
  prerequisites: Array<{ lessonId: string; title: LocalizedText }>;
}

// ---------------------------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------------------------

function toFeedback(f: z.infer<typeof feedbackSchema> | null | undefined): Feedback {
  return {
    feedbackVi: f?.feedback_vi ?? null,
    errorTags: f?.error_tags ?? [],
    displayAnswer: f?.display_answer ?? null,
    explanation: f?.explanation ?? null,
  };
}

export function toRunState(run: z.infer<typeof runStateSchema>): RunState {
  const attempts: Record<string, GradedAttempt> = {};
  for (const a of run.attempts ?? []) {
    const prev = attempts[a.exercise_id];
    if (prev && prev.attemptNo > a.attempt_no) continue;
    attempts[a.exercise_id] = {
      attemptNo: a.attempt_no,
      verdict: a.verdict,
      isCorrect: a.is_correct,
      revealed: a.revealed,
      feedback: toFeedback(a.feedback_json),
    };
  }
  return { runId: run.run_id, status: run.status, cursor: run.cursor, queue: run.queue, attempts };
}

/** Inverse of `toRunState`, in the server shape, so cached snapshots go through the same schema on read. */
export function fromRunState(run: RunState): z.input<typeof runStateSchema> {
  return {
    run_id: run.runId,
    status: run.status,
    cursor: run.cursor,
    queue: run.queue,
    attempts: Object.entries(run.attempts).map(([exerciseId, a]) => ({
      exercise_id: exerciseId,
      attempt_no: a.attemptNo,
      verdict: a.verdict,
      is_correct: a.isCorrect,
      revealed: a.revealed,
      feedback_json: {
        feedback_vi: a.feedback.feedbackVi,
        error_tags: a.feedback.errorTags,
        display_answer: a.feedback.displayAnswer,
        explanation: a.feedback.explanation,
      },
    })),
  };
}

/** Validates a `get_lesson` payload (fresh or cached). Throws `InvalidServerResponseError`. */
export function parseLessonPayload(data: unknown): LessonPayload {
  const p = parse(lessonPayloadSchema, 'get_lesson', data);
  return {
    lesson: {
      id: p.lesson.id,
      languageCode: p.lesson.language_code,
      levelCode: p.lesson.level_code,
      title: p.lesson.title,
      objectives: p.lesson.objectives,
      body: p.lesson.body,
      estimatedMinutes: p.lesson.estimated_minutes,
      skills: p.lesson.skills ?? [],
      contentVersion: p.content_version,
      isDemo: p.is_demo,
      items: (p.items ?? []).map((i) => ({ id: i.id, itemType: i.item_type, front: i.front, back: i.back, audioPath: i.audio_path ?? null })),
      exercises: p.exercises.map((e) => ({
        id: e.id,
        version: e.version,
        orderIndex: e.order_index,
        type: e.exercise_type,
        stage: e.stage,
        answerLang: e.answer_lang,
        prompt: e.prompt,
        itemId: e.item_id ?? null,
      })),
    },
    run: p.run ? toRunState(p.run) : null,
  };
}

export function parseRunState(data: unknown, rpc = 'start_lesson'): RunState {
  return toRunState(parse(runStateSchema, rpc, data));
}

// ---------------------------------------------------------------------------------------------
// RPC wrappers
// ---------------------------------------------------------------------------------------------

/** Raw `get_lesson` JSON (for the offline cache); validate with `parseLessonPayload`. */
export async function getLessonRaw(client: AppSupabaseClient, lessonId: string, pathId: string): Promise<unknown> {
  return callRpc(client, 'get_lesson', { p_lesson_id: lessonId, p_path_id: pathId });
}

export async function getLesson(client: AppSupabaseClient, lessonId: string, pathId: string): Promise<LessonPayload> {
  return parseLessonPayload(await getLessonRaw(client, lessonId, pathId));
}

/** Returns the in-progress run or creates one. */
export async function startLesson(client: AppSupabaseClient, lessonId: string, pathId: string): Promise<RunState> {
  return parseRunState(await callRpc(client, 'start_lesson', { p_lesson_id: lessonId, p_path_id: pathId }));
}

/** The server keeps `greatest(cursor, p_cursor)`. */
export async function saveLessonCursor(client: AppSupabaseClient, runId: string, cursor: number): Promise<void> {
  await callRpc(client, 'save_lesson_cursor', { p_run_id: runId, p_cursor: cursor });
}

export const SUBMIT_TIMEOUT_MS = 15_000;

export async function submitExercise(
  client: AppSupabaseClient,
  input: SubmitInput,
  options: { signal?: AbortSignal } = {},
): Promise<SubmitResult> {
  const signal = options.signal ?? (typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(SUBMIT_TIMEOUT_MS) : undefined);
  const data = await callRpc(
    client,
    'submit_exercise',
    {
      p_run_id: input.runId,
      p_exercise_id: input.exerciseId,
      p_exercise_version: input.exerciseVersion,
      p_idempotency_key: input.idempotencyKey,
      p_response: input.response,
      p_confidence: input.confidence,
      p_response_ms: input.responseMs,
      p_hint_count: input.hintCount,
      p_client_at: input.clientAt,
    },
    signal ? { signal } : {},
  );
  const r = parse(submitResultSchema, 'submit_exercise', data);
  return {
    attemptId: r.attempt_id,
    attemptNo: r.attempt_no,
    verdict: r.verdict,
    isCorrect: r.is_correct,
    score: r.score,
    revealed: r.revealed,
    requeued: r.requeued,
    replayed: r.replayed,
    feedback: toFeedback(r),
  };
}

export async function completeLesson(client: AppSupabaseClient, runId: string): Promise<CompleteResult> {
  const r = parse(completeResultSchema, 'complete_lesson', await callRpc(client, 'complete_lesson', { p_run_id: runId }));
  return {
    runId: r.run_id,
    nextReviewAt: r.next_review_at,
    completedAt: r.completed_at ?? null,
    summary: {
      accuracyByStage: r.summary.accuracy_by_stage,
      almostCount: r.summary.almost_count,
      confidentWrong: r.summary.confident_wrong,
      unsureRight: r.summary.unsure_right,
    },
  };
}

export async function listPathLessons(client: AppSupabaseClient, pathId: string): Promise<PathLesson[]> {
  const rows = parse(z.array(pathLessonRowSchema), 'path_lessons', (await callRpc(client, 'path_lessons', { p_path_id: pathId })) ?? []);
  return rows.map((r) => ({
    lessonId: r.lesson_id,
    unit: { id: r.unit.id, title: r.unit.title, orderIndex: r.unit.order_index ?? null },
    program: { id: r.program.id, title: r.program.title, orderIndex: r.program.order_index ?? null },
    title: r.title,
    levelCode: r.level_code,
    estimatedMinutes: r.estimated_minutes,
    isDemo: r.is_demo,
    prerequisitesMet: r.prerequisites_met,
    runStatus: r.run_status,
    prerequisites: (r.prerequisites ?? []).map((p) => ({ lessonId: p.lesson_id, title: p.title })),
  }));
}
