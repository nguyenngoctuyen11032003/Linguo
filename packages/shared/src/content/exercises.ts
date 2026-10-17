import { z } from 'zod';

// Spec 2 §5: exercise prompts (public), answer keys (server-only), rubric and learner responses.
// JSON keys stay snake_case because these objects are stored as jsonb and exchanged with RPCs as-is.

export const EXERCISE_TYPES = ['mcq', 'fill_blank', 'word_bank', 'translate', 'listen'] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const EXERCISE_STAGES = ['recognition', 'recall', 'application'] as const;
export type ExerciseStage = (typeof EXERCISE_STAGES)[number];

export const ANSWER_LANGS = ['en', 'ko', 'ja', 'de', 'vi'] as const;
export type AnswerLang = (typeof ANSWER_LANGS)[number];

export const VERDICTS = ['correct', 'almost', 'incorrect'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Built-in error tags produced by the grader; `known_wrong` entries may add their own snake_case tags. */
export const BUILTIN_ERROR_TAGS = ['typo', 'article', 'spacing', 'particle_allomorph', 'missing_diacritics'] as const;

export const RESPONSE_TEXT_MAX = 300;

export const choiceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/);
export const errorTagSchema = z.string().regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
const textSchema = z.string().trim().min(1).max(500);
const langSchema = z.enum(ANSWER_LANGS);
const hintLevelsSchema = z.array(textSchema).min(1).max(2);

const optionSchema = z.strictObject({ id: choiceIdSchema, text: textSchema, lang: langSchema });
const optionsSchema = z
  .array(optionSchema)
  .min(2)
  .max(6)
  .refine((options) => new Set(options.map((o) => o.id)).size === options.length, { message: 'duplicate_option_id' });

export const mcqPromptSchema = z.strictObject({
  stem: textSchema,
  stem_lang: langSchema,
  options: optionsSchema,
  shuffle: z.boolean().default(true),
});

export const fillBlankPromptSchema = z
  .strictObject({
    template: textSchema,
    blanks: z
      .array(z.strictObject({ id: choiceIdSchema, width_hint: z.number().int().min(1).max(30).optional() }))
      .min(1)
      .max(5),
    hint_levels: hintLevelsSchema.optional(),
  })
  .refine((p) => p.blanks.every((b) => p.template.includes(`{{${b.id}}}`)), { message: 'blank_missing_in_template' });

export const wordBankPromptSchema = z.strictObject({
  instruction: textSchema,
  tokens: z
    .array(z.strictObject({ id: choiceIdSchema, text: textSchema }))
    .min(2)
    .max(16)
    .refine((tokens) => new Set(tokens.map((t) => t.id)).size === tokens.length, { message: 'duplicate_token_id' }),
});

export const translatePromptSchema = z.strictObject({
  source_text: textSchema,
  source_lang: langSchema,
  direction: z.enum(['vi_to_target', 'target_to_vi']),
  hint_levels: hintLevelsSchema.optional(),
});

export const listenPromptSchema = z.strictObject({
  audio_asset_id: z.string().min(1).max(200).nullable(),
  fallback_text: textSchema,
  options: optionsSchema,
  shuffle: z.boolean().default(true),
});

export const PROMPT_SCHEMAS = {
  mcq: mcqPromptSchema,
  fill_blank: fillBlankPromptSchema,
  word_bank: wordBankPromptSchema,
  translate: translatePromptSchema,
  listen: listenPromptSchema,
} as const;

export type McqPrompt = z.infer<typeof mcqPromptSchema>;
export type FillBlankPrompt = z.infer<typeof fillBlankPromptSchema>;
export type WordBankPrompt = z.infer<typeof wordBankPromptSchema>;
export type TranslatePrompt = z.infer<typeof translatePromptSchema>;
export type ListenPrompt = z.infer<typeof listenPromptSchema>;

// ---------------------------------------------------------------------------
// Answer keys (server-only; stored in content_private.exercise_keys)
// ---------------------------------------------------------------------------

export const choiceAnswerSchema = z.strictObject({ correct_option_id: choiceIdSchema });
export const fillBlankAnswerSchema = z.strictObject({
  blanks: z
    .record(choiceIdSchema, z.array(textSchema).min(1))
    .refine((b) => Object.keys(b).length > 0, { message: 'blanks_empty' }),
});
export const wordBankAnswerSchema = z.strictObject({ orders: z.array(z.array(choiceIdSchema).min(1)).min(1) });
export const translateAnswerSchema = z.strictObject({ accepted: z.array(textSchema).min(1) });

export const ANSWER_SCHEMAS = {
  mcq: choiceAnswerSchema,
  fill_blank: fillBlankAnswerSchema,
  word_bank: wordBankAnswerSchema,
  translate: translateAnswerSchema,
  listen: choiceAnswerSchema,
} as const;

export type ChoiceAnswer = z.infer<typeof choiceAnswerSchema>;
export type FillBlankAnswer = z.infer<typeof fillBlankAnswerSchema>;
export type WordBankAnswer = z.infer<typeof wordBankAnswerSchema>;
export type TranslateAnswer = z.infer<typeof translateAnswerSchema>;
export type ExerciseAnswer = ChoiceAnswer | FillBlankAnswer | WordBankAnswer | TranslateAnswer;

export const rubricSchema = z.strictObject({
  punctuation: z.enum(['ignore', 'strict']).default('ignore'),
  diacritics: z.enum(['strict', 'lenient']).default('strict'),
  ko_spacing: z.enum(['strict', 'lenient']).default('lenient'),
  typo_tolerance: z.union([z.literal(0), z.literal(1)]).default(0),
  expand_contractions: z.boolean().default(true),
});
export type Rubric = z.infer<typeof rubricSchema>;
export const DEFAULT_RUBRIC: Rubric = rubricSchema.parse({});

export const knownWrongSchema = z.strictObject({ answer: textSchema, feedback_vi: textSchema, error_tag: errorTagSchema });
export type KnownWrong = z.infer<typeof knownWrongSchema>;

// ---------------------------------------------------------------------------
// Learner responses
// ---------------------------------------------------------------------------

export const choiceResponseSchema = z.strictObject({ option_id: choiceIdSchema });
export const fillBlankResponseSchema = z.strictObject({ blanks: z.record(choiceIdSchema, z.string().max(RESPONSE_TEXT_MAX)) });
export const wordBankResponseSchema = z.strictObject({ token_ids: z.array(choiceIdSchema).min(1).max(16) });
export const textResponseSchema = z.strictObject({ text: z.string().max(RESPONSE_TEXT_MAX) });
export const giveUpResponseSchema = z.strictObject({ give_up: z.literal(true) });

export const RESPONSE_SCHEMAS = {
  mcq: choiceResponseSchema,
  fill_blank: fillBlankResponseSchema,
  word_bank: wordBankResponseSchema,
  translate: textResponseSchema,
  listen: choiceResponseSchema,
} as const;

export type ChoiceResponse = z.infer<typeof choiceResponseSchema>;
export type FillBlankResponse = z.infer<typeof fillBlankResponseSchema>;
export type WordBankResponse = z.infer<typeof wordBankResponseSchema>;
export type TextResponse = z.infer<typeof textResponseSchema>;
export type GiveUpResponse = z.infer<typeof giveUpResponseSchema>;
export type ExerciseResponse = ChoiceResponse | FillBlankResponse | WordBankResponse | TextResponse | GiveUpResponse;

/** Accepts the type-specific response shape or the universal give-up response. */
export function responseSchemaFor(type: ExerciseType) {
  return z.union([RESPONSE_SCHEMAS[type], giveUpResponseSchema]);
}

export function isGiveUp(response: ExerciseResponse): response is GiveUpResponse {
  return 'give_up' in response;
}
