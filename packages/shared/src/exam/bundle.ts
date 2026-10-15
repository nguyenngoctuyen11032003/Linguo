import { z } from 'zod';
import { LANGUAGE_CODES } from '../constants';
import { localizedTextSchema } from '../content/authoring';
import { EXAM_BUNDLE_VERSION, EXAM_FAMILIES, EXAM_QUESTION_KINDS, EXAM_SECTIONS, examScoringSchema } from './contract';

// Spec 9 §2–3: the bundle `scripts/content-import.mjs` builds from content/exams/<lang>/*.yaml for
// public.import_exam_content_bundle(jsonb) (wrapper of content_private.import_exam_bundle).
// - ids are UUIDv5 of the key under CONTENT_UUID_NAMESPACE (scripts/content/ids.mjs);
// - content_hash is sha256 hex of the canonical row without review fields; a form's hash also
//   folds in its questions' hashes, so editing any question bumps the form's version;
// - mcq options follow the diagnostic precedent: shuffled deterministically by question key and
//   re-labelled with opaque ids (`o` + 8 hex), so neither position nor id reveals the answer;
//   `answer` is the opaque id of the correct option;
// - `prompt` is the public part (never `script`, answers or rubric); the private columns
//   (answer, explanation, script, rubric, sample_answer) go to content_private.exam_keys.

const textLang = z.enum(['en', 'ko', 'ja', 'vi']);
const hash = z.string().regex(/^[0-9a-f]{64}$/);

export const examBundleQuestionSchema = z.strictObject({
  id: z.uuid(),
  key: z.string().min(1),
  /** 1-based position in the form (authoring order; sections are contiguous). */
  seq: z.number().int().min(1),
  section: z.enum(EXAM_SECTIONS),
  kind: z.enum(EXAM_QUESTION_KINDS),
  question_type: z.string(),
  level_code: z.string(),
  points: z.number().int().min(1),
  /** Public prompt as stored in exam_questions.prompt. */
  prompt: z.strictObject({
    instruction_vi: z.string(),
    stem: z.string(),
    stem_lang: textLang,
    passage: z.string().optional(),
    audio_asset_id: z.string().nullable(),
    options: z.array(z.strictObject({ id: z.string(), text: z.string(), lang: textLang })).min(2).max(5).optional(),
    min_chars: z.number().int().optional(),
    max_chars: z.number().int().optional(),
  }),
  /** mcq: correct option id; short_text: accepted answers; essay: null. */
  answer: z.union([z.string(), z.array(z.string()).min(1)]).nullable(),
  explanation: localizedTextSchema,
  /** Listening script (target language), revealed only in the result review. */
  script: z.string().nullable(),
  rubric: z
    .array(z.strictObject({ key: z.string(), label_vi: z.string(), description_vi: z.string(), max_points: z.number().int() }))
    .nullable(),
  sample_answer: z.string().nullable(),
  content_hash: hash,
});
export type ExamBundleQuestion = z.infer<typeof examBundleQuestionSchema>;

export const examBundleFormSchema = z.strictObject({
  id: z.uuid(),
  key: z.string().min(1),
  language_code: z.enum(LANGUAGE_CODES),
  family: z.enum(EXAM_FAMILIES),
  title_vi: z.string(),
  description_vi: z.string(),
  level_from: z.string(),
  level_to: z.string(),
  /** Key of the source in content/sources.yaml (resolved to source_id by the import). */
  source_key: z.string().min(1),
  time_limits: z.partialRecord(z.enum(EXAM_SECTIONS), z.number().int().min(1)),
  scoring: examScoringSchema,
  is_demo: z.boolean(),
  content_hash: hash,
  reviewed_by: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  questions: z.array(examBundleQuestionSchema).min(1),
});
export type ExamBundleForm = z.infer<typeof examBundleFormSchema>;

export const examBundleSchema = z.strictObject({
  bundle_version: z.literal(EXAM_BUNDLE_VERSION),
  forms: z.array(examBundleFormSchema),
});
export type ExamBundle = z.infer<typeof examBundleSchema>;
