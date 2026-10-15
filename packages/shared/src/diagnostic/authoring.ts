import { z } from 'zod';
import { LANGUAGE_CODES } from '../constants';
import { contentKeySchema, localizedTextSchema } from '../content/authoring';
import { DIAGNOSTIC_ITEM_TYPES, DIAGNOSTIC_SKILLS } from './rpc';

// Spec 4 §3: the diagnostic item bank as authored in content/diagnostic/<en|ko|ja>/<skill>.yaml and the
// bundle `scripts/content-import.mjs` builds for content_private.import_diagnostic_bundle(jsonb).
// Cross-file rules (answer is an option id, unique stems, ≥ 5 items per skill × level, level valid
// for the language, demo header, NFC) live in scripts/content/check.mjs.

export const DIAGNOSTIC_SCHEMA_VERSION = 1;
export const DIAGNOSTIC_BUNDLE_VERSION = 1;
export const KEY_CONFIDENCES = ['unreviewed', 'reviewed'] as const;
export type KeyConfidence = (typeof KEY_CONFIDENCES)[number];
/** Minimum items per skill × level × language (spec 4 plan, task D5). */
export const DIAGNOSTIC_MIN_ITEMS_PER_CELL = 5;
/** Option languages: Vietnamese or a target language. */
export const DIAGNOSTIC_TEXT_LANGS = ['en', 'ko', 'ja', 'vi'] as const;

const text = z.string().trim().min(1);

export const diagnosticOptionSchema = z.strictObject({
  /** Authored id, referenced by `answer`. The build replaces it with an opaque id. */
  id: z.string().regex(/^[a-z0-9]{1,8}$/),
  text: text.max(300),
  lang: z.enum(DIAGNOSTIC_TEXT_LANGS),
});

export const diagnosticAuthoredItemSchema = z.strictObject({
  /** Stable repo key, e.g. `en:diag:vocab-a1-apple`; the item id is its UUIDv5. */
  key: contentKeySchema,
  level: z.string().min(1),
  item_type: z.enum(DIAGNOSTIC_ITEM_TYPES),
  /** IRT difficulty b on the level-ordinal scale; default ordinal(level) + 0.5. */
  difficulty: z.number().min(-0.5).max(6.5).optional(),
  prompt: z.strictObject({
    stem: text.max(600),
    stem_lang: z.enum(DIAGNOSTIC_TEXT_LANGS),
    /** reading_mcq only. */
    passage: text.max(2000).optional(),
    options: z.array(diagnosticOptionSchema).min(2).max(6),
  }),
  /** Authored id of the correct option. */
  answer: z.string().min(1),
  explanation: localizedTextSchema,
});
export type DiagnosticAuthoredItem = z.infer<typeof diagnosticAuthoredItemSchema>;

export const diagnosticFileSchema = z.strictObject({
  schema_version: z.literal(DIAGNOSTIC_SCHEMA_VERSION),
  demo: z.boolean(),
  language: z.enum(LANGUAGE_CODES),
  skill: z.enum(DIAGNOSTIC_SKILLS),
  /** Applies to every item of the file; demo files must stay `unreviewed`. */
  key_confidence: z.enum(KEY_CONFIDENCES).default('unreviewed'),
  /** Review of the whole file: demo files leave both null; non-demo files need both. */
  reviewed_by: z.string().min(1).max(120).nullable().default(null),
  reviewed_at: z.iso.datetime({ offset: true }).nullable().default(null),
  items: z.array(diagnosticAuthoredItemSchema).min(1),
});
export type DiagnosticFile = z.infer<typeof diagnosticFileSchema>;

const hash = z.string().regex(/^[0-9a-f]{64}$/);

export const diagnosticBundleItemSchema = z.strictObject({
  id: z.uuid(),
  key: z.string().min(1),
  language_code: z.enum(LANGUAGE_CODES),
  skill: z.enum(DIAGNOSTIC_SKILLS),
  level_code: z.string(),
  difficulty: z.number(),
  item_type: z.enum(DIAGNOSTIC_ITEM_TYPES),
  /** Public part, served as-is by the RPCs (packages/shared/src/diagnostic/rpc.ts diagnosticItemSchema.prompt). */
  prompt: z.strictObject({
    stem: z.string(),
    stem_lang: z.enum(DIAGNOSTIC_TEXT_LANGS),
    passage: z.string().optional(),
    options: z.array(z.strictObject({ id: z.string(), text: z.string(), lang: z.enum(DIAGNOSTIC_TEXT_LANGS) })).min(2).max(6),
  }),
  /** Id of the correct option in `prompt.options`; never exposed to clients. */
  answer_key: z.string(),
  explanation: localizedTextSchema,
  key_confidence: z.enum(KEY_CONFIDENCES),
  status: z.literal('published'),
  is_demo: z.boolean(),
  reviewed_by: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  content_hash: hash,
});
export type DiagnosticBundleItem = z.infer<typeof diagnosticBundleItemSchema>;

export const diagnosticBundleSchema = z.strictObject({
  bundle_version: z.literal(DIAGNOSTIC_BUNDLE_VERSION),
  git_sha: z.string().nullable(),
  items: z.array(diagnosticBundleItemSchema),
});
export type DiagnosticBundle = z.infer<typeof diagnosticBundleSchema>;
// content_private.import_diagnostic_bundle returns the same counts as the lesson import
// (importResultSchema in ../content/bundle.ts).
