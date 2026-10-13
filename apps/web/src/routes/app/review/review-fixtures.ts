import { vi } from 'vitest';
import type { ReviewCard, ReviewGradeResult, ReviewQueue, ReviewSummary } from '@linguo/shared';
import type { ReviewSessionApi } from '@/features/reviews/types';

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export function reviewCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    card_id: uuid(),
    item_id: uuid(),
    direction: 'recognize',
    state: 'review',
    is_new: false,
    due_at: '2026-10-13T00:00:00Z',
    postpone_count: 0,
    item: {
      language_code: 'en',
      item_type: 'vocab',
      front: { text: 'hello', ipa: '/həˈloʊ/' },
      back: { meaning: { vi: 'xin chào' }, examples: [] },
      audio_path: null,
    },
    previews: {
      again: { interval_minutes: 1, due_at: '2026-10-13T00:01:00Z' },
      hard: { interval_minutes: 10, due_at: '2026-10-13T00:10:00Z' },
      good: { interval_minutes: 1440, due_at: '2026-10-14T00:00:00Z' },
      easy: { interval_minutes: 5760, due_at: '2026-10-17T00:00:00Z' },
    },
    ...overrides,
  };
}

export function queueTotals(overrides: Partial<ReviewQueue['totals']> = {}): ReviewQueue['totals'] {
  return {
    due_total: 3,
    served: 3,
    backlog_remaining: 0,
    new_available: 0,
    daily_cap: 90,
    reviewed_today: 0,
    recovery_mode: false,
    ...overrides,
  };
}

export function gradeResult(overrides: Partial<ReviewGradeResult> = {}): ReviewGradeResult {
  return {
    card_id: uuid(),
    log_id: uuid(),
    state: 'review',
    due_at: '2026-10-14T00:00:00Z',
    interval_minutes: 1440,
    rating_effective: 3,
    item_status: 'review',
    newly_mastered: false,
    replayed: false,
    ...overrides,
  };
}

export function reviewSummary(overrides: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    reviewed_today: 3,
    remaining_today: 0,
    forecast: [
      { date: '2026-10-13', count: 0 },
      { date: '2026-10-14', count: 7 },
    ],
    retention_30d: null,
    retention_sample: 0,
    mastered_total: 0,
    mastered_this_week: 0,
    recovery_mode: false,
    ...overrides,
  };
}

export function sessionApi(overrides: Partial<ReviewSessionApi> = {}): ReviewSessionApi {
  return {
    status: 'ready',
    error: null,
    totals: queueTotals(),
    card: reviewCard(),
    position: 0,
    total: 3,
    cardState: { status: 'front' },
    flip: vi.fn(),
    grade: vi.fn().mockResolvedValue(undefined),
    postpone: vi.fn().mockResolvedValue(undefined),
    graded: [],
    pendingCount: 0,
    summary: null,
    loadMore: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn(),
    ...overrides,
  };
}
