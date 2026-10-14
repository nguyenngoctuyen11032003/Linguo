import { z } from 'zod';

// Spec 5: request/response contract of the `ai-tutor` Edge Function.
// This file is copied verbatim into supabase/functions/_shared/ai-contract.ts by
// scripts/sync-ai-contract.mjs (CI runs --check), so it may import only `zod`.

export const AI_TASKS = ['explain_concept', 'generate_practice', 'analyze_error', 'review_writing'] as const;
export type AiTask = (typeof AI_TASKS)[number];

export const AI_ERROR_CODES = ['bad_request', 'unauthorized', 'quota_exceeded', 'ai_unavailable', 'invalid_output'] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

/** 16 KB: room for a review_writing request (essay + prompt + rubric; Korean is 3 bytes per character). */
export const AI_REQUEST_MAX_BYTES = 16 * 1024;
/** review_writing: longest essay the AI reviews (longer answers are rejected, never truncated). */
export const REVIEW_WRITING_ANSWER_MAX_CHARS = 1500;
/** review_writing: longest essay prompt (instruction + passage + question). */
export const REVIEW_WRITING_PROMPT_MAX_CHARS = 1200;
export const REVIEW_WRITING_MAX_CRITERIA = 6;
export const AI_REPORT_REASONS = ['wrong', 'unclear', 'unsafe', 'other'] as const;

const language = z.enum(['en', 'ko']);
const level = z.string().regex(/^[a-z0-9_]{2,10}$/);
const shortText = (max: number) => z.string().trim().min(1).max(max);

const common = {
  language,
  level,
  /** Optional published lesson the question is about; only its public fields are sent to the model. */
  lesson_id: z.uuid().optional(),
};

export const explainConceptRequestSchema = z.strictObject({
  task: z.literal('explain_concept'),
  ...common,
  concept: shortText(300),
  context: shortText(600).optional(),
  variant: z.enum(['default', 'simpler', 'different']).default('default'),
});

export const generatePracticeRequestSchema = z.strictObject({
  task: z.literal('generate_practice'),
  ...common,
  skill: z.enum(['vocabulary', 'grammar', 'reading']),
  count: z.number().int().min(1).max(5).default(3),
  focus: shortText(300).optional(),
});

export const analyzeErrorRequestSchema = z.strictObject({
  task: z.literal('analyze_error'),
  ...common,
  prompt: shortText(500),
  expected: shortText(300),
  answer: z.string().trim().max(300),
});

/** Spec 9 X6: practice feedback on an exam essay against its rubric (never an official score). */
export const reviewWritingRequestSchema = z.strictObject({
  task: z.literal('review_writing'),
  language,
  level,
  prompt: shortText(REVIEW_WRITING_PROMPT_MAX_CHARS),
  answer: shortText(REVIEW_WRITING_ANSWER_MAX_CHARS),
  rubric: z
    .array(
      z.strictObject({
        key: z.string().regex(/^[a-z_]{2,32}$/),
        label_vi: shortText(80),
        description_vi: shortText(300),
        max_points: z.number().int().min(1).max(30),
      }),
    )
    .min(1)
    .max(REVIEW_WRITING_MAX_CRITERIA)
    .refine((rows) => new Set(rows.map((r) => r.key)).size === rows.length, { message: 'duplicate rubric key' }),
});

export const aiRequestSchema = z.discriminatedUnion('task', [
  explainConceptRequestSchema,
  generatePracticeRequestSchema,
  analyzeErrorRequestSchema,
  reviewWritingRequestSchema,
]);
export type AiRequest = z.infer<typeof aiRequestSchema>;
export type AiRequestInput = z.input<typeof aiRequestSchema>;

const md = (max: number) => z.string().max(max);
const example = z.strictObject({ target: md(300), vi: md(300) });

export const explainConceptOutputSchema = z.strictObject({
  summary: md(300),
  explanation_md: md(2000),
  examples: z.array(example).max(5),
  common_mistakes: z.array(md(300)).max(5),
  confidence: z.enum(['high', 'medium', 'low']),
  /** Set when the model is unsure; the UI points to curated content. */
  uncertainty: md(300).nullable(),
});

export const generatePracticeOutputSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        question: md(300),
        options: z.array(md(150)).min(2).max(5),
        answer: md(150),
        explanation_vi: md(500),
      }),
    )
    .min(1)
    .max(5),
});

export const analyzeErrorOutputSchema = z.strictObject({
  verdict: z.enum(['correct', 'minor_issue', 'incorrect']),
  error_type: md(80).nullable(),
  explanation_md: md(1500),
  corrected: md(300).nullable(),
  tip_vi: md(300).nullable(),
});

export const reviewWritingOutputSchema = z.strictObject({
  /** One entry per rubric criterion (same keys); points never exceed its max_points (checked by the Edge Function). */
  criteria: z
    .array(
      z.strictObject({
        key: md(32),
        points: z.number().int().min(0).max(30),
        comment_vi: md(500),
      }),
    )
    .min(1)
    .max(REVIEW_WRITING_MAX_CRITERIA),
  overall_vi: md(800),
  /** The learner's essay rewritten naturally in the target language. */
  corrected_version: md(2000),
});

export const AI_OUTPUT_SCHEMAS = {
  explain_concept: explainConceptOutputSchema,
  generate_practice: generatePracticeOutputSchema,
  analyze_error: analyzeErrorOutputSchema,
  review_writing: reviewWritingOutputSchema,
} as const;

export type ExplainConceptOutput = z.infer<typeof explainConceptOutputSchema>;
export type GeneratePracticeOutput = z.infer<typeof generatePracticeOutputSchema>;
export type AnalyzeErrorOutput = z.infer<typeof analyzeErrorOutputSchema>;
export type ReviewWritingOutput = z.infer<typeof reviewWritingOutputSchema>;
export type ReviewWritingRequestInput = z.input<typeof reviewWritingRequestSchema>;

export const aiQuotaSchema = z.strictObject({ used: z.number().int(), limit: z.number().int(), resets_at: z.string() });

export const aiSuccessSchema = z.strictObject({
  task: z.enum(AI_TASKS),
  prompt_version: z.string(),
  data: z.unknown(),
  cached: z.boolean(),
  ai_generated: z.literal(true),
  /** Opaque id the report button sends back (never contains content). */
  response_id: z.string(),
  quota: aiQuotaSchema,
});
export type AiSuccess = z.infer<typeof aiSuccessSchema>;

export const aiErrorSchema = z.strictObject({
  error: z.enum(AI_ERROR_CODES),
  message: z.string(),
  retry_after_sec: z.number().int().nullable(),
  quota: aiQuotaSchema.nullable(),
});
export type AiError = z.infer<typeof aiErrorSchema>;
