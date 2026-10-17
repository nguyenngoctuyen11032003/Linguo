import { z } from 'zod';
import { LANGUAGE_CODES } from '../constants';
import { contentKeySchema, localizedTextSchema } from '../content/authoring';

// Spec 9: exam practice (PRD §9). Authoring schema for content/exams/<en|ko|ja|de>/*.yaml,
// the bundle for content_private.import_exam_bundle(jsonb), and the JSON exchanged
// with the exam RPCs. snake_case mirrors the SQL jsonb exactly.

export const EXAM_SCHEMA_VERSION = 1;
export const EXAM_BUNDLE_VERSION = 1;

/** Exam families. Forms are always "bài luyện mô phỏng", never official papers. */
export const EXAM_FAMILIES = ['topik_i', 'topik_ii', 'cefr', 'jlpt', 'goethe'] as const;
export type ExamFamily = (typeof EXAM_FAMILIES)[number];

/** The only language each family exists for (mirrors exam_forms_family_language and FAMILY_LANGUAGE in scripts/content/exam.mjs). */
export const EXAM_FAMILY_LANGUAGE = {
  topik_i: 'ko',
  topik_ii: 'ko',
  cefr: 'en',
  jlpt: 'ja',
  goethe: 'de',
} as const satisfies Record<ExamFamily, (typeof LANGUAGE_CODES)[number]>;

/**
 * Families judged per section against the form's level instead of converted to a scaled score: no bands, no
 * estimated_level; the result carries cefr_sections ("đạt mức"), reached at scoring.pass_ratio. cefr: pass_ratio is
 * required; goethe (Goethe-Zertifikat modules pass at 60%): pass_ratio is 0.6, and SQL falls back to 0.6 when null.
 */
export const CEFR_LIKE_EXAM_FAMILIES = ['cefr', 'goethe'] as const satisfies readonly ExamFamily[];
export function isCefrLikeFamily(family: ExamFamily): boolean {
  return (CEFR_LIKE_EXAM_FAMILIES as readonly string[]).includes(family);
}
/** Goethe-Zertifikat: a module is passed at this ratio of its points. */
export const GOETHE_PASS_RATIO = 0.6;

export const EXAM_SECTIONS = ['listening', 'reading', 'writing'] as const;
export type ExamSection = (typeof EXAM_SECTIONS)[number];

/** mcq: one option; short_text: graded against accepted answers; essay: not auto-graded. */
export const EXAM_QUESTION_KINDS = ['mcq', 'short_text', 'essay'] as const;
export type ExamQuestionKind = (typeof EXAM_QUESTION_KINDS)[number];

export const EXAM_MODES = ['full', 'section', 'question_type'] as const;
export type ExamMode = (typeof EXAM_MODES)[number];

export const EXAM_ATTEMPT_STATUSES = ['in_progress', 'submitted', 'expired'] as const;
export type ExamAttemptStatus = (typeof EXAM_ATTEMPT_STATUSES)[number];

/** Mirrors the Vietnamese error map in apps/web/src/features/exam/error-map.ts. */
export const EXAM_ERROR_CODES = [
  'not_authenticated',
  'path_not_found',
  'form_not_found',
  'language_mismatch',
  'invalid_mode',
  'attempt_not_found',
  'attempt_closed',
  'question_not_in_attempt',
  'answer_too_long',
  'idempotency_conflict',
  'rate_limited',
] as const;
export type ExamErrorCode = (typeof EXAM_ERROR_CODES)[number];

/** Server accepts saves this long after deadline_at (network slack), then closes as expired. */
export const EXAM_DEADLINE_GRACE_SEC = 30;
export const EXAM_ESSAY_MAX_CHARS = 5000;
export const EXAM_SHORT_TEXT_MAX_CHARS = 200;
/** Question-type drills serve at most this many questions across all forms of the family. */
export const EXAM_DRILL_SIZE = 10;

const text = z.string().trim().min(1);
const optionId = z.string().regex(/^[a-z0-9]{1,8}$/);
const targetLang = z.enum(['en', 'ko', 'ja', 'de', 'vi']);

// ---------------------------------------------------------------------------
// Scoring config — versioned data, never hard-coded in SQL or UI (PRD §9.2).
// ---------------------------------------------------------------------------
export const examScoringSchema = z.strictObject({
  /** false until a reviewer checked it against the current official regulation. */
  verified: z.boolean(),
  /** Where the scale comes from, shown under the result ("Nguồn thang điểm"). */
  source_note_vi: text.max(300),
  /** Official full-paper max points per section (e.g. TOPIK I: listening 100, reading 100; JLPT N3: reading 120, listening 60). */
  section_max: z.partialRecord(z.enum(EXAM_SECTIONS), z.number().int().positive()),
  /**
   * Level bands on the full-paper total, ascending. A mini mock's raw score is scaled
   * linearly to section_max before banding and labelled "quy đổi tham khảo".
   * Empty for CEFR-like forms (cefr, goethe): no score conversion (PRD §9.3).
   */
  bands: z.array(z.strictObject({ level_code: z.string(), min_total: z.number().int().min(0) })),
  /** CEFR-like (cefr, goethe): a section counts as "đạt mức <level>" at >= this ratio of its points (goethe: 0.6). */
  pass_ratio: z.number().min(0).max(1).nullable(),
});
export type ExamScoring = z.infer<typeof examScoringSchema>;

// ---------------------------------------------------------------------------
// Authoring (content/exams/<lang>/<form>.yaml)
// ---------------------------------------------------------------------------
export const examAuthoredQuestionSchema = z.strictObject({
  key: contentKeySchema,
  section: z.enum(EXAM_SECTIONS),
  kind: z.enum(EXAM_QUESTION_KINDS),
  /** Drill tag, prefixed by the family: "topik_i_read_topic", "cefr_read_gist", "goethe_read_detail", "topik_ii_write_51". */
  question_type: z.string().regex(/^[a-z0-9_]{3,48}$/),
  level_code: z.string().min(1),
  points: z.number().int().min(1).max(50),
  prompt: z.strictObject({
    /** Instruction line shown above the question, Vietnamese. */
    instruction_vi: text.max(300),
    stem: text.max(1000),
    stem_lang: targetLang,
    passage: text.max(3000).optional(),
    /** Listening: recorded asset if any; otherwise the client speaks `script` with TTS. */
    audio_asset_id: z.string().min(1).max(200).nullable().default(null),
    /** Listening script in the target language — hidden until the attempt is submitted. */
    script: text.max(3000).optional(),
    options: z.array(z.strictObject({ id: optionId, text: text.max(300), lang: targetLang })).min(2).max(5).optional(),
    /** essay only: guidance and target length. */
    min_chars: z.number().int().min(0).optional(),
    max_chars: z.number().int().min(1).max(EXAM_ESSAY_MAX_CHARS).optional(),
  }),
  /** mcq: option id; short_text: accepted answers (NFC, trimmed, case-insensitive); essay: omitted. */
  answer: z.union([optionId, z.array(text.max(EXAM_SHORT_TEXT_MAX_CHARS)).min(1)]).optional(),
  explanation: localizedTextSchema,
  /** essay only: rubric criteria shown after submit and sent to AI writing feedback. */
  rubric: z.array(z.strictObject({ key: z.string().regex(/^[a-z_]{2,32}$/), label_vi: text.max(80), description_vi: text.max(300), max_points: z.number().int().min(1).max(30) })).optional(),
  /** essay only: a model answer shown after submit. */
  sample_answer: text.max(EXAM_ESSAY_MAX_CHARS).optional(),
});
export type ExamAuthoredQuestion = z.infer<typeof examAuthoredQuestionSchema>;

export const examFileSchema = z.strictObject({
  schema_version: z.literal(EXAM_SCHEMA_VERSION),
  demo: z.boolean(),
  language: z.enum(LANGUAGE_CODES),
  form: z.strictObject({
    key: contentKeySchema,
    family: z.enum(EXAM_FAMILIES),
    title_vi: text.max(120),
    description_vi: text.max(500),
    /** Level range the form targets, e.g. topik1..topik2 or a1..a2. */
    level_from: z.string(),
    level_to: z.string(),
    source_key: contentKeySchema,
    /** Minutes per section for timed full mocks. */
    time_limits: z.partialRecord(z.enum(EXAM_SECTIONS), z.number().int().min(1).max(180)),
    scoring: examScoringSchema,
  }),
  reviewed_by: z.string().min(1).max(120).nullable().default(null),
  reviewed_at: z.iso.datetime({ offset: true }).nullable().default(null),
  questions: z.array(examAuthoredQuestionSchema).min(1),
});
export type ExamFile = z.infer<typeof examFileSchema>;

// ---------------------------------------------------------------------------
// RPC shapes
// ---------------------------------------------------------------------------
const isoTs = z.string();

/** list_exam_forms(p_language text) -> jsonb array */
export const examFormSummarySchema = z.object({
  form_id: z.uuid(),
  key: z.string(),
  language_code: z.enum(LANGUAGE_CODES),
  family: z.enum(EXAM_FAMILIES),
  title_vi: z.string(),
  description_vi: z.string(),
  level_from: z.string(),
  level_to: z.string(),
  is_demo: z.boolean(),
  sections: z.array(z.object({
    section: z.enum(EXAM_SECTIONS),
    question_count: z.number().int(),
    minutes: z.number().int().nullable(),
  })),
  question_types: z.array(z.object({ question_type: z.string(), section: z.enum(EXAM_SECTIONS), count: z.number().int() })),
  scoring_verified: z.boolean(),
  /** Latest submitted attempt by the caller on this form, if any. */
  last_attempt: z.object({ attempt_id: z.uuid(), submitted_at: isoTs, total: z.number(), max: z.number() }).nullable(),
});
export type ExamFormSummary = z.infer<typeof examFormSummarySchema>;

/** Question as served during an attempt — never contains answer, explanation, script or rubric. */
export const examServedQuestionSchema = z.object({
  question_id: z.uuid(),
  seq: z.number().int().min(1),
  section: z.enum(EXAM_SECTIONS),
  kind: z.enum(EXAM_QUESTION_KINDS),
  question_type: z.string(),
  points: z.number().int(),
  prompt: z.object({
    instruction_vi: z.string(),
    stem: z.string(),
    stem_lang: targetLang,
    passage: z.string().optional(),
    audio_asset_id: z.string().nullable(),
    /** Listening without a recording: the TTS text. Present only when audio_asset_id is null. */
    tts_text: z.string().optional(),
    options: z.array(z.object({ id: z.string(), text: z.string(), lang: targetLang })).optional(),
    min_chars: z.number().int().optional(),
    max_chars: z.number().int().optional(),
  }),
  /** Saved answer: option id / text, or null. */
  answer: z.string().nullable(),
  flagged: z.boolean(),
});
export type ExamServedQuestion = z.infer<typeof examServedQuestionSchema>;

/** start_exam(...) and get_exam_attempt(p_attempt_id) while in progress. */
export const examAttemptSchema = z.object({
  attempt_id: z.uuid(),
  form_id: z.uuid(),
  form_title_vi: z.string(),
  family: z.enum(EXAM_FAMILIES),
  mode: z.enum(EXAM_MODES),
  section: z.enum(EXAM_SECTIONS).nullable(),
  question_type: z.string().nullable(),
  status: z.enum(EXAM_ATTEMPT_STATUSES),
  started_at: isoTs,
  /** null = untimed (section / question_type practice). */
  deadline_at: isoTs.nullable(),
  server_now: isoTs,
  questions: z.array(examServedQuestionSchema),
  /** Present when the path goal does not match the form (PRD §9.2 warning). */
  structure_warning_vi: z.string().nullable(),
});
export type ExamAttempt = z.infer<typeof examAttemptSchema>;

/** save_exam_answer(p_attempt_id, p_question_id, p_answer text|null, p_flagged bool, p_idempotency_key uuid) */
export const examSaveResultSchema = z.object({
  saved: z.boolean(),
  status: z.enum(EXAM_ATTEMPT_STATUSES),
  server_now: isoTs,
  replayed: z.boolean(),
});

const scoreRow = { points: z.number(), max: z.number(), correct: z.number().int(), total: z.number().int() };

/** submit_exam(p_attempt_id) and get_exam_attempt(p_attempt_id) once closed. */
export const examResultSchema = z.object({
  attempt_id: z.uuid(),
  form_id: z.uuid(),
  form_title_vi: z.string(),
  family: z.enum(EXAM_FAMILIES),
  mode: z.enum(EXAM_MODES),
  status: z.enum(['submitted', 'expired']),
  started_at: isoTs,
  submitted_at: isoTs,
  /** Auto-graded points only; essays are excluded from total and max. */
  total: z.number(),
  max: z.number(),
  by_section: z.array(z.object({ section: z.enum(EXAM_SECTIONS), ...scoreRow, scaled: z.number().nullable() })),
  by_question_type: z.array(z.object({ question_type: z.string(), section: z.enum(EXAM_SECTIONS), ...scoreRow })),
  /** TOPIK and JLPT full mocks only: band on the scaled total; null otherwise. */
  estimated_level: z.object({ level_code: z.string().nullable(), scaled_total: z.number(), label_vi: z.string() }).nullable(),
  /** cefr and goethe: per-section "đạt mức" judgement against the form's level (no score conversion); null otherwise. */
  cefr_sections: z.array(z.object({ section: z.enum(EXAM_SECTIONS), level_code: z.string(), reached: z.boolean() })).nullable(),
  scoring_verified: z.boolean(),
  scoring_source_vi: z.string(),
  review: z.array(z.object({
    question_id: z.uuid(),
    seq: z.number().int(),
    section: z.enum(EXAM_SECTIONS),
    kind: z.enum(EXAM_QUESTION_KINDS),
    question_type: z.string(),
    points: z.number().int(),
    prompt: examServedQuestionSchema.shape.prompt.extend({ script: z.string().optional() }),
    answer: z.string().nullable(),
    /** null for essays. */
    is_correct: z.boolean().nullable(),
    correct_answer: z.string().nullable(),
    explanation: localizedTextSchema,
    rubric: z.array(z.object({ key: z.string(), label_vi: z.string(), description_vi: z.string(), max_points: z.number().int() })).nullable(),
    sample_answer: z.string().nullable(),
  })),
});
export type ExamResult = z.infer<typeof examResultSchema>;

/** exam_history(p_path_id uuid, p_limit int) -> jsonb array (newest first). */
export const examHistoryEntrySchema = z.object({
  attempt_id: z.uuid(),
  form_title_vi: z.string(),
  family: z.enum(EXAM_FAMILIES),
  mode: z.enum(EXAM_MODES),
  section: z.enum(EXAM_SECTIONS).nullable(),
  status: z.enum(EXAM_ATTEMPT_STATUSES),
  started_at: isoTs,
  submitted_at: isoTs.nullable(),
  total: z.number().nullable(),
  max: z.number().nullable(),
  estimated_level_code: z.string().nullable(),
  scoring_verified: z.boolean(),
});
export type ExamHistoryEntry = z.infer<typeof examHistoryEntrySchema>;
