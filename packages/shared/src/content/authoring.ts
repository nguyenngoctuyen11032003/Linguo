import { z } from 'zod';
import { LANGUAGE_CODES } from '../constants';
import { GOAL_TYPES } from '../learning/levels';
import {
  ANSWER_LANGS,
  ANSWER_SCHEMAS,
  EXERCISE_STAGES,
  PROMPT_SCHEMAS,
  knownWrongSchema,
  rubricSchema,
} from './exercises';

// Spec 2 §3–4: content as authored in content/**/*.yaml (one schema per file kind).

export const CONTENT_SCHEMA_VERSION = 1;
export const CONTENT_STATUSES = ['draft', 'in_review', 'approved', 'published', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const LICENSES = ['own', 'cc_by', 'cc_by_sa', 'public_domain', 'licensed'] as const;
export const PROGRAM_KINDS = ['core', 'goal'] as const;
export const ITEM_TYPES = ['vocab', 'phrase', 'grammar_point', 'hangul', 'kana'] as const;
export const ITEM_ROLES = ['introduce', 'reuse'] as const;
export const TARGET_LANGS = ['en', 'ko', 'ja', 'de'] as const;

/** Stable repo keys, e.g. `en:lesson:greetings-hello`, `src:linguo-demo`. */
export const contentKeySchema = z.string().regex(/^(?:en|ko|ja|de|src):(?:[a-z]+:)?[a-z0-9][a-z0-9-]{0,63}$/);
export const localizedTextSchema = z.strictObject({ vi: z.string().trim().min(1).max(2000) });
export type LocalizedText = z.infer<typeof localizedTextSchema>;

const targetText = z.string().trim().min(1).max(500);
const reviewFields = {
  status: z.enum(CONTENT_STATUSES).default('draft'),
  reviewed_by: z.string().min(1).max(120).nullable().default(null),
  reviewed_at: z.iso.datetime({ offset: true }).nullable().default(null),
};
/**
 * Review fields of learning items (per items file) and sources (per entry). `status` has no
 * default: demo rows import as `published`, non-demo rows must set it explicitly
 * (scripts/content/check.mjs).
 */
const optionalReviewFields = {
  status: z.enum(CONTENT_STATUSES).optional(),
  reviewed_by: z.string().min(1).max(120).nullable().default(null),
  reviewed_at: z.iso.datetime({ offset: true }).nullable().default(null),
};

// ---------------------------------------------------------------------------
// Lesson body blocks (PRD §6.2)
// ---------------------------------------------------------------------------

export const lessonBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('objective'), text: localizedTextSchema }),
  z.strictObject({ type: z.literal('explain'), text: localizedTextSchema }),
  z.strictObject({ type: z.literal('deep_explain'), text: localizedTextSchema }),
  z.strictObject({
    type: z.literal('example'),
    target: targetText,
    target_lang: z.enum(TARGET_LANGS),
    translation: localizedTextSchema,
    note: localizedTextSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('common_mistake'),
    wrong: targetText,
    right: targetText,
    target_lang: z.enum(TARGET_LANGS),
    note: localizedTextSchema,
  }),
  z.strictObject({ type: z.literal('summary'), points: z.array(localizedTextSchema).min(1).max(8) }),
]);
export type LessonBlock = z.infer<typeof lessonBlockSchema>;
/** Blocks every lesson must contain (spec 2 §4.3). */
export const REQUIRED_BLOCKS = ['objective', 'explain', 'example', 'common_mistake', 'summary'] as const;

// ---------------------------------------------------------------------------
// Learning items (PRD §6.4)
// ---------------------------------------------------------------------------

export const itemFrontSchema = z.strictObject({
  text: targetText,
  ipa: z.string().max(120).optional(),
  /** ja: kana reading of a word written with kanji (学校 → がっこう); shown above the romanization. */
  reading: z.string().max(120).optional(),
  romanization: z.string().max(120).optional(),
  pos: z.string().max(40).optional(),
});
export const itemBackSchema = z.strictObject({
  meaning: localizedTextSchema,
  examples: z
    .array(z.strictObject({ target: targetText, translation: localizedTextSchema }))
    .max(5)
    .default([]),
  pronunciation_note: localizedTextSchema.optional(),
  confusion: localizedTextSchema.optional(),
});

export const itemSchema = z.strictObject({
  key: contentKeySchema,
  type: z.enum(ITEM_TYPES),
  level: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  skill_tags: z.array(z.string().min(1)).default([]),
  front: itemFrontSchema,
  back: itemBackSchema,
  audio_path: z.string().max(300).nullable().default(null),
});
export type AuthoredItem = z.infer<typeof itemSchema>;

// ---------------------------------------------------------------------------
// Exercises: prompt + matching answer, discriminated on `type`
// ---------------------------------------------------------------------------

const exerciseBase = {
  key: contentKeySchema,
  stage: z.enum(EXERCISE_STAGES),
  answer_lang: z.enum(ANSWER_LANGS),
  difficulty: z.number().int().min(1).max(5).default(1),
  item: contentKeySchema.optional(),
  rubric: rubricSchema.default(rubricSchema.parse({})),
  known_wrong: z.array(knownWrongSchema).default([]),
  explanation: localizedTextSchema,
  display_answer: z.string().trim().min(1).max(500),
};

export const authoredExerciseSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...exerciseBase, type: z.literal('mcq'), prompt: PROMPT_SCHEMAS.mcq, answer: ANSWER_SCHEMAS.mcq }),
  z.strictObject({ ...exerciseBase, type: z.literal('fill_blank'), prompt: PROMPT_SCHEMAS.fill_blank, answer: ANSWER_SCHEMAS.fill_blank }),
  z.strictObject({ ...exerciseBase, type: z.literal('word_bank'), prompt: PROMPT_SCHEMAS.word_bank, answer: ANSWER_SCHEMAS.word_bank }),
  z.strictObject({ ...exerciseBase, type: z.literal('translate'), prompt: PROMPT_SCHEMAS.translate, answer: ANSWER_SCHEMAS.translate }),
  z.strictObject({ ...exerciseBase, type: z.literal('listen'), prompt: PROMPT_SCHEMAS.listen, answer: ANSWER_SCHEMAS.listen }),
]);
export type AuthoredExercise = z.infer<typeof authoredExerciseSchema>;

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const fileHeader = {
  schema_version: z.literal(CONTENT_SCHEMA_VERSION),
  demo: z.boolean(),
};

export const sourcesFileSchema = z.strictObject({
  schema_version: z.literal(CONTENT_SCHEMA_VERSION),
  sources: z
    .array(
      z.strictObject({
        key: contentKeySchema,
        title: z.string().min(1).max(200),
        author_or_org: z.string().min(1).max(200),
        url: z.url().nullable().default(null),
        license: z.enum(LICENSES),
        attribution_required: z.boolean().default(false),
        demo: z.boolean(),
        ...optionalReviewFields,
      }),
    )
    .min(1),
});

export const itemsFileSchema = z.strictObject({
  ...fileHeader,
  ...optionalReviewFields,
  source: contentKeySchema,
  items: z.array(itemSchema).min(1),
});

export const programFileSchema = z.strictObject({
  ...fileHeader,
  ...reviewFields,
  source: contentKeySchema,
  key: contentKeySchema,
  language: z.enum(LANGUAGE_CODES),
  title: localizedTextSchema,
  description: localizedTextSchema,
  kind: z.enum(PROGRAM_KINDS),
  goal_types: z.array(z.enum(GOAL_TYPES)).default([]),
  level_from: z.string().min(1),
  level_to: z.string().min(1),
  order_index: z.number().int().min(0),
});

export const unitFileSchema = z.strictObject({
  ...fileHeader,
  ...reviewFields,
  key: contentKeySchema,
  order_index: z.number().int().min(0),
  title: localizedTextSchema,
});

export const lessonFileSchema = z.strictObject({
  ...fileHeader,
  ...reviewFields,
  key: contentKeySchema,
  order_index: z.number().int().min(0),
  level: z.string().min(1),
  title: localizedTextSchema,
  objectives: z.array(localizedTextSchema).min(1).max(5),
  estimated_minutes: z.number().int().min(1).max(60),
  skills: z.array(z.string().min(1)).min(1),
  prerequisites: z.array(contentKeySchema).default([]),
  items: z
    .array(z.strictObject({ item: contentKeySchema, role: z.enum(ITEM_ROLES).default('introduce') }))
    .default([]),
  body: z.array(lessonBlockSchema).min(1),
  exercises: z.array(authoredExerciseSchema).min(3),
});

export type SourcesFile = z.infer<typeof sourcesFileSchema>;
export type ItemsFile = z.infer<typeof itemsFileSchema>;
export type ProgramFile = z.infer<typeof programFileSchema>;
export type UnitFile = z.infer<typeof unitFileSchema>;
export type LessonFile = z.infer<typeof lessonFileSchema>;
