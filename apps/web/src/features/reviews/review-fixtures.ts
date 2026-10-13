import type { ReviewCard, ReviewGradeArgs, ReviewGradeResult, ReviewQueue, ReviewSummary } from '@linguo/shared';

// Valid (zod-parseable) review payloads shared by the reviews unit tests.

export const PATH_ID = '30000000-0000-4000-8000-000000000001';

export function cardId(n: number): string {
  return `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function itemId(n: number): string {
  return `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const preview = (minutes: number) => ({ interval_minutes: minutes, due_at: '2026-10-14T00:00:00Z' });

export function card(n: number, overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    card_id: cardId(n),
    item_id: itemId(n),
    direction: 'recognize',
    state: 'review',
    is_new: false,
    due_at: '2026-10-13T00:00:00Z',
    postpone_count: 0,
    item: {
      language_code: 'en',
      item_type: 'vocab',
      front: { text: `word ${n}` },
      back: { meaning: { vi: `nghĩa ${n}` }, examples: [] },
      audio_path: null,
    },
    previews: { again: preview(10), hard: preview(1440), good: preview(4320), easy: preview(10080) },
    ...overrides,
  };
}

export function totals(overrides: Partial<ReviewQueue['totals']> = {}): ReviewQueue['totals'] {
  return {
    due_total: 2,
    served: 2,
    backlog_remaining: 0,
    new_available: 0,
    daily_cap: 30,
    reviewed_today: 0,
    recovery_mode: false,
    ...overrides,
  };
}

export function queue(cards: ReviewCard[], overrides: Partial<ReviewQueue['totals']> = {}): ReviewQueue {
  return { cards, totals: totals({ served: cards.length, due_total: cards.length, ...overrides }) };
}

export function gradeResult(n: number, overrides: Partial<ReviewGradeResult> = {}): ReviewGradeResult {
  return {
    card_id: cardId(n),
    log_id: `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    state: 'review',
    due_at: '2026-10-16T00:00:00Z',
    interval_minutes: 4320,
    rating_effective: 3,
    item_status: 'review',
    newly_mastered: false,
    replayed: false,
    ...overrides,
  };
}

export function gradeArgs(n: number, overrides: Partial<ReviewGradeArgs> = {}): ReviewGradeArgs {
  return {
    p_card_id: cardId(n),
    p_rating: 3,
    p_confidence: null,
    p_response_ms: 1200,
    p_hint_count: 0,
    p_idempotency_key: crypto.randomUUID(),
    p_client_at: '2026-10-13T08:00:00Z',
    ...overrides,
  };
}

export function summary(overrides: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    reviewed_today: 2,
    remaining_today: 5,
    forecast: [{ date: '2026-10-13', count: 5 }],
    retention_30d: null,
    retention_sample: 3,
    mastered_total: 1,
    mastered_this_week: 1,
    recovery_mode: false,
    ...overrides,
  };
}
