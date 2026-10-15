import { z } from 'zod';

// Spec 5: request/response contract of the `ai-tutor` Edge Function.
// This file is copied verbatim into supabase/functions/_shared/ai-contract.ts by
// scripts/sync-ai-contract.mjs (CI runs --check), so it may import only `zod`.

export const AI_TASKS = [
  'explain_concept',
  'generate_practice',
  'analyze_error',
  'review_writing',
  'analyze_sentence',
  'summarize_session',
  'plan_review',
  'roleplay_turn',
] as const;
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
/** analyze_sentence: longest sentence analysed (one sentence, not a passage). */
export const ANALYZE_SENTENCE_MAX_CHARS = 160;
export const ANALYZE_SENTENCE_MAX_TOKENS = 30;
/** summarize_session: bounds of the compact, client-built summary. */
export const SESSION_SUMMARY_MAX_ACTIVITIES = 12;
export const SESSION_SUMMARY_MAX_ERROR_TAGS = 5;
/** plan_review: bounded list of detected gaps in, at most this many steps out. */
export const PLAN_REVIEW_MAX_GAPS = 10;
export const PLAN_REVIEW_MAX_STEPS = 5;
/** roleplay_turn: a session is one opening turn (turn_index 0) plus learner turns up to MAX_TURNS - 1. */
export const ROLEPLAY_MAX_TURNS = 12;
/** roleplay_turn: only the last turns are sent as context, each bounded. */
export const ROLEPLAY_HISTORY_MAX_TURNS = 10;
export const ROLEPLAY_TURN_MAX_CHARS = 300;
export const ROLEPLAY_REPLY_MAX_CHARS = 400;
export const ROLEPLAY_MAX_CORRECTIONS = 2;
export const AI_REPORT_REASONS = ['wrong', 'unclear', 'unsafe', 'other'] as const;

const language = z.enum(['en', 'ko']);
/** CEFR (en) and TOPIK (ko) level codes; mirrors LEVELS in learning/levels.ts (a test keeps them equal). */
export const AI_LEVELS = [
  'pre_a1',
  'a1',
  'a2',
  'b1',
  'b2',
  'c1',
  'c2',
  'hangul',
  'topik1',
  'topik2',
  'topik3',
  'topik4',
  'topik5',
  'topik6',
] as const;
const AI_LEVEL_SET: ReadonlySet<string> = new Set(AI_LEVELS);
// Typed as `string` (not the enum) so callers holding a level from the database need no casts; only known codes pass.
const level = z.string().refine((v) => AI_LEVEL_SET.has(v), { message: 'unknown level' });
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

/** Spec 8.2 #4: one sentence analysed at the learner's level. Cacheable, so no lesson_id (same input → same key). */
export const analyzeSentenceRequestSchema = z.strictObject({
  task: z.literal('analyze_sentence'),
  language,
  level,
  sentence: shortText(ANALYZE_SENTENCE_MAX_CHARS),
});

const errorTagKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const count = z.number().int().min(0).max(999);

/** Spec 8.2 #9: what the learner did in a session, as numbers and tags only (no free text, no personal data). */
export const summarizeSessionRequestSchema = z.strictObject({
  task: z.literal('summarize_session'),
  language,
  level,
  minutes: z.number().int().min(0).max(300),
  activities: z
    .array(
      z.strictObject({
        kind: z.enum(['review', 'lesson', 'practice', 'recap']),
        status: z.enum(['done', 'skipped', 'pending']),
        minutes: z.number().int().min(0).max(120),
      }),
    )
    .min(1)
    .max(SESSION_SUMMARY_MAX_ACTIVITIES),
  accuracy_by_stage: z
    .array(
      z
        .strictObject({ stage: z.enum(['recognition', 'recall', 'application']), attempts: count, correct: count })
        .refine((r) => r.correct <= r.attempts, { message: 'correct over attempts' }),
    )
    .max(3)
    .default([]),
  error_tags: z
    .array(z.strictObject({ tag: errorTagKey, count: count.min(1) }))
    .max(SESSION_SUMMARY_MAX_ERROR_TAGS)
    .default([]),
});

/**
 * Spec 8.2 #7: detected gaps in (lessons the learner got wrong, weak exercise types/tags), a short plan out.
 * `id` is a lesson uuid for kind 'lesson' and a tag key for kind 'tag'; steps may only target these ids.
 */
export const planReviewRequestSchema = z.strictObject({
  task: z.literal('plan_review'),
  language,
  level,
  gaps: z
    .array(
      z.strictObject({
        kind: z.enum(['lesson', 'tag']),
        id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
        label: shortText(80),
        count: count.min(1),
      }),
    )
    .min(1)
    .max(PLAN_REVIEW_MAX_GAPS)
    .refine((rows) => new Set(rows.map((r) => `${r.kind}:${r.id}`)).size === rows.length, { message: 'duplicate gap' }),
});

/**
 * Spec 8.2 #6: one turn of a role-play conversation. The scenario is only a KEY: persona and goals come from the
 * fixed catalog (roleplay-catalog.ts), never from client text. turn_index 0 is the opening turn (no history, no
 * message); later turns carry the learner's message and the last turns of the conversation (a bounded window).
 */
export const roleplayTurnRequestSchema = z
  .strictObject({
    task: z.literal('roleplay_turn'),
    language,
    level,
    scenario_key: z.string().regex(/^[a-z][a-z_]{1,31}$/),
    history: z
      .array(z.strictObject({ role: z.enum(['partner', 'learner']), text: shortText(ROLEPLAY_TURN_MAX_CHARS) }))
      .max(ROLEPLAY_HISTORY_MAX_TURNS)
      .default([]),
    learner_message: z.string().trim().max(ROLEPLAY_TURN_MAX_CHARS).default(''),
    turn_index: z.number().int().min(0).max(ROLEPLAY_MAX_TURNS - 1),
  })
  .superRefine((req, ctx) => {
    if (req.turn_index === 0) {
      if (req.history.length > 0) ctx.addIssue({ code: 'custom', path: ['history'], message: 'opening turn has no history' });
      if (req.learner_message !== '') ctx.addIssue({ code: 'custom', path: ['learner_message'], message: 'opening turn has no message' });
      return;
    }
    if (req.learner_message === '') ctx.addIssue({ code: 'custom', path: ['learner_message'], message: 'message required' });
    // Before learner turn k the conversation holds the opening plus (k - 1) exchanges: 2k - 1 entries at most.
    if (req.history.length === 0 || req.history.length > 2 * req.turn_index - 1) {
      ctx.addIssue({ code: 'custom', path: ['history'], message: 'history does not match turn_index' });
    }
    if (req.history.at(-1)?.role !== 'partner') ctx.addIssue({ code: 'custom', path: ['history'], message: 'history must end with the partner' });
  });

export const aiRequestSchema = z.discriminatedUnion('task', [
  explainConceptRequestSchema,
  generatePracticeRequestSchema,
  analyzeErrorRequestSchema,
  reviewWritingRequestSchema,
  analyzeSentenceRequestSchema,
  summarizeSessionRequestSchema,
  planReviewRequestSchema,
  roleplayTurnRequestSchema,
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

export const SENTENCE_POS = [
  'noun',
  'pronoun',
  'verb',
  'auxiliary',
  'adjective',
  'adverb',
  'determiner',
  'preposition',
  'conjunction',
  'interjection',
  'particle',
  'ending',
  'number',
  'other',
] as const;
export const SENTENCE_COMPONENTS = ['subject', 'predicate', 'object', 'complement', 'adverbial', 'modifier', 'topic', 'other'] as const;

export const analyzeSentenceOutputSchema = z.strictObject({
  /** The natural meaning in Vietnamese. */
  translation_vi: md(300),
  alternative_meanings: z.array(md(200)).max(3),
  /** Words/morphemes copied from the sentence (checked by the Edge Function), with their part of speech. */
  tokens: z
    .array(z.strictObject({ text: md(40), pos: z.enum(SENTENCE_POS), meaning_vi: md(120) }))
    .min(1)
    .max(ANALYZE_SENTENCE_MAX_TOKENS),
  components: z.array(z.strictObject({ label: z.enum(SENTENCE_COMPONENTS), text: md(80), note_vi: md(200) })).max(8),
  grammar_points: z.array(z.strictObject({ pattern: md(80), explanation_vi: md(300) })).max(4),
  confidence: z.enum(['high', 'medium', 'low']),
  uncertainty: md(300).nullable(),
});

export const summarizeSessionOutputSchema = z.strictObject({
  recap_vi: md(600),
  /** Each tag comes from the request's error_tags (checked by the Edge Function). */
  errors_to_remember: z.array(z.strictObject({ tag: md(40), note_vi: md(300) })).max(3),
  next_step_vi: md(300),
});

export const PLAN_REVIEW_STEP_KINDS = ['review_cards', 'redo_lesson'] as const;

export const planReviewOutputSchema = z.strictObject({
  summary_vi: md(300),
  /** target is always an id from the request's gaps; review_cards carries a card count, redo_lesson null. */
  steps: z
    .array(
      z.strictObject({
        kind: z.enum(PLAN_REVIEW_STEP_KINDS),
        target: md(64),
        cards: z.number().int().min(1).max(30).nullable(),
        reason_vi: md(200),
      }),
    )
    .min(1)
    .max(PLAN_REVIEW_MAX_STEPS),
});

/** Spec 8.2 #6: the partner's next line plus gentle feedback on the learner's last message only. */
export const roleplayTurnOutputSchema = z.strictObject({
  /** In the target language (Hangul for ko); in character, short, usually ends with a follow-up question. */
  partner_reply: md(ROLEPLAY_REPLY_MAX_CHARS),
  hint_vi: md(200).nullable(),
  /** Real errors in the learner's last message only; empty for the opening turn. */
  corrections: z.array(z.strictObject({ original: md(300), corrected: md(300), note_vi: md(300) })).max(ROLEPLAY_MAX_CORRECTIONS),
  /** Goal keys reached so far; each comes from the scenario (checked by the Edge Function). */
  goal_progress: z.array(md(40)).max(6),
  finished: z.boolean(),
});

export const AI_OUTPUT_SCHEMAS = {
  explain_concept: explainConceptOutputSchema,
  generate_practice: generatePracticeOutputSchema,
  analyze_error: analyzeErrorOutputSchema,
  review_writing: reviewWritingOutputSchema,
  analyze_sentence: analyzeSentenceOutputSchema,
  summarize_session: summarizeSessionOutputSchema,
  plan_review: planReviewOutputSchema,
  roleplay_turn: roleplayTurnOutputSchema,
} as const;

export type ExplainConceptOutput = z.infer<typeof explainConceptOutputSchema>;
export type GeneratePracticeOutput = z.infer<typeof generatePracticeOutputSchema>;
export type AnalyzeErrorOutput = z.infer<typeof analyzeErrorOutputSchema>;
export type ReviewWritingOutput = z.infer<typeof reviewWritingOutputSchema>;
export type AnalyzeSentenceOutput = z.infer<typeof analyzeSentenceOutputSchema>;
export type SummarizeSessionOutput = z.infer<typeof summarizeSessionOutputSchema>;
export type PlanReviewOutput = z.infer<typeof planReviewOutputSchema>;
export type RoleplayTurnOutput = z.infer<typeof roleplayTurnOutputSchema>;
export type RoleplayTurnRequestInput = z.input<typeof roleplayTurnRequestSchema>;
export type AnalyzeSentenceRequestInput = z.input<typeof analyzeSentenceRequestSchema>;
export type SummarizeSessionRequestInput = z.input<typeof summarizeSessionRequestSchema>;
export type PlanReviewRequestInput = z.input<typeof planReviewRequestSchema>;
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
