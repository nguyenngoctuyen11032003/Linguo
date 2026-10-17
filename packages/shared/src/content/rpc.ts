import { z } from 'zod';
import { ITEM_ROLES, ITEM_TYPES, lessonBlockSchema, localizedTextSchema } from './authoring';
import { ANSWER_LANGS, EXERCISE_STAGES, EXERCISE_TYPES, knownWrongSchema, VERDICTS } from './exercises';

// Spec 2 §3.5 and §6.3: JSON returned by path_lessons, get_lesson, start_lesson,
// submit_exercise and complete_lesson. snake_case mirrors the SQL jsonb exactly.

export const RUN_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Mirrors the Vietnamese error map in apps/web/src/features/lesson-player/error-map.ts. */
export const LESSON_ERROR_CODES = [
  'not_authenticated',
  'lesson_not_found',
  'path_not_found',
  'lesson_not_in_path',
  'run_not_found',
  'run_not_active',
  'exercise_not_in_lesson',
  'exercise_version_mismatch',
  'invalid_response',
  'idempotency_conflict',
  'rate_limited',
  'attempts_incomplete',
  'invalid_cursor',
  'run_id_conflict',
  'too_many_lessons',
  'invalid_lessons',
] as const;

export const pathLessonSchema = z.object({
  lesson_id: z.uuid(),
  lesson_key: z.string(),
  program_id: z.uuid(),
  program_title: localizedTextSchema,
  unit_id: z.uuid(),
  unit_title: localizedTextSchema,
  unit_order: z.number().int(),
  lesson_order: z.number().int(),
  title: localizedTextSchema,
  level_code: z.string(),
  estimated_minutes: z.number().int(),
  is_demo: z.boolean(),
  prerequisite_ids: z.array(z.uuid()),
  prerequisites_met: z.boolean(),
  run_status: z.enum(RUN_STATUSES),
});
export type PathLesson = z.infer<typeof pathLessonSchema>;

export const publicExerciseSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  version: z.number().int(),
  order_index: z.number().int(),
  type: z.enum(EXERCISE_TYPES),
  stage: z.enum(EXERCISE_STAGES),
  answer_lang: z.enum(ANSWER_LANGS),
  item_id: z.uuid().nullable(),
  difficulty: z.number().int(),
  /** Validated per type with PROMPT_SCHEMAS on the client before rendering. */
  prompt: z.record(z.string(), z.unknown()),
});
export type PublicExercise = z.infer<typeof publicExerciseSchema>;

export const lessonItemSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  item_type: z.enum(ITEM_TYPES),
  front: z.record(z.string(), z.unknown()),
  back: z.record(z.string(), z.unknown()),
  audio_path: z.string().nullable(),
  role: z.enum(ITEM_ROLES),
  position: z.number().int(),
});
export type LessonItem = z.infer<typeof lessonItemSchema>;

export const lessonRunSchema = z.object({
  id: z.uuid(),
  status: z.enum(['in_progress', 'completed']),
  cursor: z.number().int(),
  /** Exercise ids in play order; re-check entries are appended (an id may appear twice). */
  queue: z.array(z.uuid()),
  next_review_at: z.string().nullable(),
  summary: z.record(z.string(), z.unknown()).nullable(),
});
export type LessonRun = z.infer<typeof lessonRunSchema>;

export const submitResultSchema = z.object({
  attempt_id: z.uuid(),
  attempt_no: z.number().int(),
  verdict: z.enum(VERDICTS),
  is_correct: z.boolean(),
  score: z.number(),
  error_tags: z.array(z.string()),
  feedback_vi: z.string().nullable(),
  revealed: z.boolean(),
  display_answer: z.string().nullable(),
  explanation: localizedTextSchema.nullable(),
  /** The exercise is resolved (correct/almost, or the answer has been revealed). */
  final: z.boolean(),
  /** The exercise was appended to the run queue for an end-of-lesson re-check. */
  requeued: z.boolean(),
  replayed: z.boolean(),
});
export type SubmitResult = z.infer<typeof submitResultSchema>;

export const lessonAttemptSchema = submitResultSchema.omit({ replayed: true }).extend({
  /** get_lesson omits the answer fields of attempts that did not reveal the answer. */
  display_answer: z.string().nullable().default(null),
  explanation: localizedTextSchema.nullable().default(null),
  exercise_id: z.uuid(),
  after_reveal: z.boolean(),
  created_at: z.string(),
});
export type LessonAttempt = z.infer<typeof lessonAttemptSchema>;

export const lessonInfoSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  language_code: z.enum(['en', 'ko', 'ja', 'de']),
  level_code: z.string(),
  title: localizedTextSchema,
  objectives: z.array(localizedTextSchema),
  body: z.array(lessonBlockSchema),
  estimated_minutes: z.number().int(),
  skills: z.array(z.string()),
  content_version: z.number().int(),
  is_demo: z.boolean(),
  unit_title: localizedTextSchema,
  program_title: localizedTextSchema,
});

export const lessonPayloadSchema = z.object({
  lesson: lessonInfoSchema,
  items: z.array(lessonItemSchema),
  exercises: z.array(publicExerciseSchema),
  run: lessonRunSchema.nullable(),
  /** All attempts of the open (or latest completed) run, oldest first. */
  attempts: z.array(lessonAttemptSchema),
});
export type LessonPayload = z.infer<typeof lessonPayloadSchema>;

export const completeResultSchema = z.object({
  accuracy_by_stage: z.object({
    recognition: z.number().nullable(),
    recall: z.number().nullable(),
    application: z.number().nullable(),
  }),
  almost_count: z.number().int(),
  confident_wrong: z.number().int(),
  unsure_right: z.number().int(),
  next_review_at: z.string(),
  completed_at: z.string(),
});
export type CompleteResult = z.infer<typeof completeResultSchema>;

/** Arguments of submit_exercise as sent by the client (and stored in the offline outbox). */
export const submitArgsSchema = z.object({
  p_run_id: z.uuid(),
  p_exercise_id: z.uuid(),
  p_exercise_version: z.number().int(),
  p_idempotency_key: z.uuid(),
  p_response: z.record(z.string(), z.unknown()),
  p_confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  p_response_ms: z.number().int(),
  p_hint_count: z.number().int(),
  p_client_at: z.string(),
});
export type SubmitArgs = z.infer<typeof submitArgsSchema>;

// ---------------------------------------------------------------------------
// Offline lessons (20261020000100_offline_lessons.sql): manifest and packs with answer keys
// ---------------------------------------------------------------------------

/** One row of offline_lesson_manifest(p_path_id): a pack is stale when any of these differs from the stored one. */
export const offlineManifestRowSchema = z.object({
  lesson_id: z.uuid(),
  content_version: z.number().int(),
  content_hash: z.string(),
  exercise_versions_hash: z.string(),
  items_hash: z.string(),
});
export type OfflineManifestRow = z.infer<typeof offlineManifestRowSchema>;

/**
 * The current answer key of one published exercise. answer_key / rubric stay loose here (the server validated them
 * at import); localRun parses them per exercise type before grading.
 */
export const offlineKeySchema = z.object({
  exercise_id: z.uuid(),
  version: z.number().int(),
  answer_key: z.record(z.string(), z.unknown()),
  rubric: z.record(z.string(), z.unknown()),
  known_wrong: z.array(knownWrongSchema),
  explanation: localizedTextSchema,
  display_answer: z.string(),
  created_at: z.string(),
});
export type OfflineKey = z.infer<typeof offlineKeySchema>;

/** One lesson of offline_lesson_packs: the public lesson payload (as get_lesson) plus the current keys. */
export const offlinePackSchema = z.object({
  lesson: lessonInfoSchema,
  items: z.array(lessonItemSchema),
  exercises: z.array(publicExerciseSchema),
  content_version: z.number().int(),
  keys: z.array(offlineKeySchema),
});
export type OfflinePack = z.infer<typeof offlinePackSchema>;

export const offlinePacksResultSchema = z.object({
  packs: z.array(offlinePackSchema),
  /** Requested ids that are not (or no longer) in the path's lesson list. */
  missing: z.array(z.uuid()),
});
export type OfflinePacksResult = z.infer<typeof offlinePacksResultSchema>;

/** Arguments of start_lesson as queued by the offline outbox (a run minted on the device). */
export const startLessonArgsSchema = z.object({
  p_lesson_id: z.uuid(),
  p_path_id: z.uuid(),
  p_run_id: z.uuid().optional(),
  p_client_at: z.string().optional(),
});
export type StartLessonArgs = z.infer<typeof startLessonArgsSchema>;
