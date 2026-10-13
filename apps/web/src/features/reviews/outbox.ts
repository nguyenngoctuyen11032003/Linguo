import { reviewGradeArgsSchema, type ReviewGradeArgs, type ReviewGradeResult } from '@linguo/shared';
import { openOutbox, type OutboxEntryOf, type OutboxKind, type OutboxOf } from '@/features/lesson-player/outbox';
import type { OutboxChannel, OutboxOutcomeOf } from '@/features/lesson-player/useOutboxSync';
import { gradeReview } from './service';

// Spec 3 §6: grades that never reached the server wait here (same store, cap, backoff and 7-day expiry as the
// lesson outbox) and are replayed FIFO by OutboxSyncProvider with the same idempotency key.

export const REVIEW_OUTBOX_KEY_PREFIX = 'linguo-review-outbox-v1:';

export const REVIEW_OUTBOX: OutboxKind<ReviewGradeArgs> = {
  keyPrefix: REVIEW_OUTBOX_KEY_PREFIX,
  argsSchema: reviewGradeArgsSchema,
};

export const REVIEW_OUTBOX_CHANNEL: OutboxChannel<ReviewGradeArgs, ReviewGradeResult> = {
  kind: REVIEW_OUTBOX,
  send: gradeReview,
  lockName: 'linguo-review-outbox',
};

export type ReviewOutboxEntry = OutboxEntryOf<ReviewGradeArgs>;
export type ReviewOutbox = OutboxOf<ReviewGradeArgs>;
export type ReviewOutboxOutcome = OutboxOutcomeOf<ReviewGradeResult>;
export type ReviewOutboxResultHandler = (idempotencyKey: string, outcome: ReviewOutboxOutcome, entry: ReviewOutboxEntry) => void;

export function reviewOutboxKey(userId: string): string {
  return `${REVIEW_OUTBOX_KEY_PREFIX}${userId}`;
}

export function createReviewOutbox(userId: string, storage?: Storage | null): ReviewOutbox {
  return storage === undefined ? openOutbox(REVIEW_OUTBOX, userId) : openOutbox(REVIEW_OUTBOX, userId, storage);
}
