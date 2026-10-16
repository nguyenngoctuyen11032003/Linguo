import type { ReviewGradeResult, Rating, ReviewCard, ReviewQueue, ReviewSummary } from '@linguo/shared';

// Spec 3 §6: contract between the review data layer (useReviewSession),
// the flashcard components and the review screen.

export type Confidence = 1 | 2 | 3;

export interface GradeMeta {
  /** Asked before flipping on recall cards; null when skipped or not asked. */
  confidence: Confidence | null;
  responseMs: number;
  hintCount: number;
}

export type CardUiState =
  | { status: 'front' }
  | { status: 'back' }
  | { status: 'submitting' }
  /** Saved in the review outbox; the session moves on, the result arrives later. */
  | { status: 'pending_sync' }
  | { status: 'graded'; result: ReviewGradeResult };

export interface ReviewSessionApi {
  status: 'loading' | 'ready' | 'empty' | 'error' | 'finished';
  /** Vietnamese message (from reviewErrorMessage) when status is 'error'. */
  error: string | null;
  totals: ReviewQueue['totals'] | null;
  card: ReviewCard | null;
  /** 0-based position in this session and the number of cards served. */
  position: number;
  total: number;
  cardState: CardUiState;
  flip: () => void;
  grade: (rating: Rating, meta: GradeMeta) => Promise<void>;
  /** Postpone the current card (or, with `all`, every remaining card) to tomorrow. */
  postpone: (all?: boolean) => Promise<void>;
  /** Cards graded in this session, for the summary screen. */
  graded: ReviewGradeResult[];
  /**
   * Cards this session queued offline whose grade the server later dropped: not reviewed, they stay due.
   * A card leaves the list once a grade for it is accepted.
   */
  syncFailed: string[];
  pendingCount: number;
  summary: ReviewSummary | null;
  /** Fetch 10 more new/due cards after the daily cap ("+10 thẻ nữa"). */
  loadMore: () => Promise<void>;
  retry: () => void;
}
