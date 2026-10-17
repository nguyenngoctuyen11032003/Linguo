import { z } from 'zod';
import { ITEM_TYPES } from '../content/authoring';

// Spec 3: JSON exchanged with get_review_queue, grade_review, postpone_reviews and
// review_summary. snake_case mirrors the SQL jsonb exactly.

export const CARD_DIRECTIONS = ['recognize', 'recall'] as const;
export type CardDirection = (typeof CARD_DIRECTIONS)[number];

export const FSRS_STATES = ['new', 'learning', 'review', 'relearning'] as const;
export type FsrsState = (typeof FSRS_STATES)[number];

/** Learner-facing status (PRD §7.1); `mastered`/`suspended` are derived on the server. */
export const ITEM_STATUSES = ['new', 'learning', 'review', 'relearning', 'mastered', 'suspended'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** 1 = Quên (Again), 2 = Khó (Hard), 3 = Được (Good), 4 = Dễ (Easy). */
export const RATINGS = [1, 2, 3, 4] as const;
export type Rating = (typeof RATINGS)[number];
export const RATING_KEYS = ['again', 'hard', 'good', 'easy'] as const;

/** Mirrors the Vietnamese error map in apps/web/src/features/reviews/error-map.ts. */
export const REVIEW_ERROR_CODES = [
  'not_authenticated',
  'path_not_found',
  'path_not_active',
  'card_not_found',
  'card_suspended',
  'card_not_due',
  'invalid_rating',
  'idempotency_conflict',
  'rate_limited',
  'postpone_limit',
] as const;

const previewSchema = z.object({
  /** Minutes until the card is due again if graded with this rating. */
  interval_minutes: z.number().int().min(0),
  due_at: z.string(),
});

export const reviewCardSchema = z.object({
  card_id: z.uuid(),
  item_id: z.uuid(),
  direction: z.enum(CARD_DIRECTIONS),
  state: z.enum(FSRS_STATES),
  is_new: z.boolean(),
  due_at: z.string(),
  postpone_count: z.number().int(),
  item: z.object({
    language_code: z.enum(['en', 'ko', 'ja', 'de']),
    item_type: z.enum(ITEM_TYPES),
    /** itemFrontSchema: { text, ipa?, reading?, romanization?, pos? } */
    front: z.record(z.string(), z.unknown()),
    /** itemBackSchema: { meaning: {vi}, examples[], pronunciation_note?, confusion? } */
    back: z.record(z.string(), z.unknown()),
    audio_path: z.string().nullable(),
  }),
  previews: z.object({ again: previewSchema, hard: previewSchema, good: previewSchema, easy: previewSchema }),
});
export type ReviewCard = z.infer<typeof reviewCardSchema>;

export const reviewQueueSchema = z.object({
  cards: z.array(reviewCardSchema),
  totals: z.object({
    due_total: z.number().int(),
    served: z.number().int(),
    backlog_remaining: z.number().int(),
    new_available: z.number().int(),
    daily_cap: z.number().int(),
    reviewed_today: z.number().int(),
    recovery_mode: z.boolean(),
  }),
});
export type ReviewQueue = z.infer<typeof reviewQueueSchema>;

export const reviewGradeArgsSchema = z.object({
  p_card_id: z.uuid(),
  p_rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  p_confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  p_response_ms: z.number().int(),
  p_hint_count: z.number().int(),
  p_idempotency_key: z.uuid(),
  p_client_at: z.string(),
});
export type ReviewGradeArgs = z.infer<typeof reviewGradeArgsSchema>;

export const reviewGradeResultSchema = z.object({
  card_id: z.uuid(),
  log_id: z.uuid(),
  state: z.enum(FSRS_STATES),
  due_at: z.string(),
  interval_minutes: z.number().int(),
  rating_effective: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  item_status: z.enum(ITEM_STATUSES),
  newly_mastered: z.boolean(),
  replayed: z.boolean(),
});
export type ReviewGradeResult = z.infer<typeof reviewGradeResultSchema>;

export const postponeResultSchema = z.object({ postponed: z.number().int(), skipped: z.number().int(), replayed: z.boolean() });
export type PostponeResult = z.infer<typeof postponeResultSchema>;

export const reviewSummarySchema = z.object({
  reviewed_today: z.number().int(),
  remaining_today: z.number().int(),
  /** Next 7 local days including today: number of cards due on each day. */
  forecast: z.array(z.object({ date: z.string(), count: z.number().int() })),
  /** Share of first-try Good/Easy on review cards with interval ≥ 7 days over the last 30 days; null when sample < 20. */
  retention_30d: z.number().nullable(),
  retention_sample: z.number().int(),
  mastered_total: z.number().int(),
  mastered_this_week: z.number().int(),
  recovery_mode: z.boolean(),
});
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;
