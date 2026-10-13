import { describe, expect, it, vi } from 'vitest';
import { isNetworkError } from '@/lib/network-error';
import { fakeClient } from '../../../tests/unit/fake-supabase';
import { PATH_ID, card, cardId, gradeArgs, gradeResult, queue, summary } from './review-fixtures';
import { REVIEW_RPC_TIMEOUT_MS, getReviewQueue, getReviewSummary, gradeReview, postponeReviews } from './service';

describe('reviews service', () => {
  it('gets the review queue with the default batch', async () => {
    const q = queue([card(1), card(2)]);
    const client = fakeClient({}, { get_review_queue: { data: q } });
    expect(await getReviewQueue(client, PATH_ID)).toEqual(q);
    expect(client.rpcCalls).toEqual([['get_review_queue', { p_path_id: PATH_ID, p_limit: 20, p_extra: false }]]);
  });

  it('asks for extra cards', async () => {
    const client = fakeClient({}, { get_review_queue: { data: queue([]) } });
    await getReviewQueue(client, PATH_ID, { limit: 10, extra: true });
    expect(client.rpcCalls).toEqual([['get_review_queue', { p_path_id: PATH_ID, p_limit: 10, p_extra: true }]]);
  });

  it('grades a card with the args unchanged', async () => {
    const args = gradeArgs(1);
    const client = fakeClient({}, { grade_review: { data: gradeResult(1) } });
    expect(await gradeReview(client, args)).toEqual(gradeResult(1));
    expect(client.rpcCalls).toEqual([['grade_review', args]]);
  });

  it('postpones some or all cards', async () => {
    const client = fakeClient({}, { postpone_reviews: { data: { postponed: 1, skipped: 0, replayed: false } } });
    expect(await postponeReviews(client, PATH_ID, [cardId(1)], 'k1')).toEqual({ postponed: 1, skipped: 0, replayed: false });
    await postponeReviews(client, PATH_ID, null, 'k2');
    expect(client.rpcCalls).toEqual([
      ['postpone_reviews', { p_path_id: PATH_ID, p_card_ids: [cardId(1)], p_idempotency_key: 'k1' }],
      ['postpone_reviews', { p_path_id: PATH_ID, p_card_ids: null, p_idempotency_key: 'k2' }],
    ]);
  });

  it('gets the summary', async () => {
    const client = fakeClient({}, { review_summary: { data: summary() } });
    expect(await getReviewSummary(client, PATH_ID)).toEqual(summary());
    expect(client.rpcCalls).toEqual([['review_summary', { p_path_id: PATH_ID }]]);
  });

  it('rethrows the supabase error', async () => {
    const error = { message: 'card_not_found', code: 'P0001' };
    const client = fakeClient({}, { grade_review: { data: null, error } });
    await expect(gradeReview(client, gradeArgs(1))).rejects.toBe(error);
  });

  it('throws invalid_payload when the response does not match the contract', async () => {
    const client = fakeClient({}, { grade_review: { data: { card_id: 'x' } }, get_review_queue: { data: { cards: [] } } });
    await expect(gradeReview(client, gradeArgs(1))).rejects.toThrow('invalid_payload');
    await expect(getReviewQueue(client, PATH_ID)).rejects.toThrow('invalid_payload');
  });

  it('abandons a review RPC after 15 s, reported as a network failure', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const error = { message: 'AbortError: signal timed out', code: '' };
    const client = { rpc: () => ({ abortSignal: () => Promise.resolve({ data: null, error, status: 0 }) }) } as unknown as Parameters<
      typeof gradeReview
    >[0];
    const thrown = await gradeReview(client, gradeArgs(1)).catch((e: unknown) => e);
    expect(REVIEW_RPC_TIMEOUT_MS).toBe(15_000);
    expect(timeout).toHaveBeenCalledWith(REVIEW_RPC_TIMEOUT_MS);
    expect(isNetworkError(thrown)).toBe(true);
    timeout.mockRestore();
  });
});
