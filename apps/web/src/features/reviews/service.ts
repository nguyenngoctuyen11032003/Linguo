import {
  postponeResultSchema,
  reviewGradeResultSchema,
  reviewQueueSchema,
  reviewSummarySchema,
  type PostponeResult,
  type ReviewGradeArgs,
  type ReviewGradeResult,
  type ReviewQueue,
  type ReviewSummary,
} from '@linguo/shared';
import { callRpc, LESSON_RPC_TIMEOUT_MS, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Spec 3 §4/§6. Same transport as the lesson RPCs: jsonb validated with the shared zod contracts, abandoned
// after 15 s (an AbortError with status 0, which callers treat like a network failure).

export const REVIEW_RPC_TIMEOUT_MS = LESSON_RPC_TIMEOUT_MS;
/** Default batch for a review session (`get_review_queue` p_limit). */
export const REVIEW_QUEUE_LIMIT = 20;
/** "+10 thẻ nữa": the extra batch served with p_extra. */
export const REVIEW_EXTRA_LIMIT = 10;

export interface QueueOptions {
  limit?: number;
  extra?: boolean;
}

export async function getReviewQueue(client: AppSupabaseClient, pathId: string, options: QueueOptions = {}): Promise<ReviewQueue> {
  const data = await callRpc(client, 'get_review_queue', {
    p_path_id: pathId,
    p_limit: options.limit ?? REVIEW_QUEUE_LIMIT,
    p_extra: options.extra ?? false,
  });
  return parse(reviewQueueSchema, data);
}

export async function gradeReview(client: AppSupabaseClient, args: ReviewGradeArgs): Promise<ReviewGradeResult> {
  return parse(reviewGradeResultSchema, await callRpc(client, 'grade_review', args));
}

/** `cardIds` null postpones every card of the path due today. */
export async function postponeReviews(
  client: AppSupabaseClient,
  pathId: string,
  cardIds: string[] | null,
  idempotencyKey: string,
): Promise<PostponeResult> {
  const data = await callRpc(client, 'postpone_reviews', {
    p_path_id: pathId,
    p_card_ids: cardIds,
    p_idempotency_key: idempotencyKey,
  });
  return parse(postponeResultSchema, data);
}

export async function getReviewSummary(client: AppSupabaseClient, pathId: string): Promise<ReviewSummary> {
  return parse(reviewSummarySchema, await callRpc(client, 'review_summary', { p_path_id: pathId }));
}
