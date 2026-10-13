import { render, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { submitArgs } from '@/features/lesson-player/lesson-fixtures';
import { createOutbox } from '@/features/lesson-player/outbox';
import { OutboxSyncProvider, useOutboxSyncContext } from '@/features/lesson-player/OutboxSyncProvider';
import { gradeArgs, gradeResult } from './review-fixtures';
import { REVIEW_OUTBOX_CHANNEL, createReviewOutbox, reviewOutboxKey, type ReviewOutboxResultHandler } from './outbox';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };

afterEach(() => {
  localStorage.clear();
  mocks.rpc.mockReset();
});

describe('review outbox', () => {
  it('stores grades under linguo-review-outbox-v1:<userId>, apart from lesson answers', () => {
    const outbox = createReviewOutbox('u1');
    const args = gradeArgs(1);
    expect(outbox.add({ args, queueIndex: 3, createdAt: '2026-10-13T08:00:00Z' })).toBe(true);
    expect(outbox.key).toBe('linguo-review-outbox-v1:u1');
    expect(reviewOutboxKey('u2')).toBe('linguo-review-outbox-v1:u2');
    expect(JSON.parse(localStorage.getItem('linguo-review-outbox-v1:u1')!)).toEqual([
      { args, queueIndex: 3, createdAt: '2026-10-13T08:00:00Z', tries: 0, nextAttemptAt: 0 },
    ]);
    expect(createOutbox('u1').list()).toEqual([]);
  });

  it('validates entries with reviewGradeArgsSchema', () => {
    const valid = { args: gradeArgs(1), queueIndex: 0, createdAt: '2026-10-13T08:00:00Z', tries: 0, nextAttemptAt: 0 };
    const lessonEntry = { ...valid, args: submitArgs() };
    const badRating = { ...valid, args: { ...gradeArgs(2), p_rating: 5 } };
    localStorage.setItem(reviewOutboxKey('u1'), JSON.stringify([lessonEntry, badRating, valid]));
    expect(createReviewOutbox('u1').list()).toEqual([valid]);
  });

  it('dedupes by idempotency key and reports storage failures', () => {
    const args = gradeArgs(1);
    const outbox = createReviewOutbox('u1');
    outbox.add({ args, queueIndex: 0 });
    outbox.add({ args: { ...args, p_rating: 1 }, queueIndex: 1 });
    expect(outbox.list()).toHaveLength(1);
    expect(createReviewOutbox('u1', null).add({ args: gradeArgs(2), queueIndex: 0 })).toBe(false);
  });

  it('replays through grade_review under its own lock', () => {
    expect(REVIEW_OUTBOX_CHANNEL.lockName).toBe('linguo-review-outbox');
    expect(REVIEW_OUTBOX_CHANNEL.kind.keyPrefix).toBe('linguo-review-outbox-v1:');
  });
});

function Reviews({ onResult }: { onResult: ReviewOutboxResultHandler }) {
  const { pendingCount, reviews } = useOutboxSyncContext();
  useEffect(() => reviews.subscribe(onResult), [onResult, reviews]);
  return (
    <>
      <output data-testid="lesson">{pendingCount}</output>
      <output data-testid="reviews">{reviews.pendingCount}</output>
    </>
  );
}

describe('OutboxSyncProvider with review grades', () => {
  it('replays queued grades and hands results to review subscribers only', async () => {
    const args = gradeArgs(1);
    createReviewOutbox(USER_ID).add({ args, queueIndex: 0 });
    const graded = gradeResult(1, { replayed: true });
    mocks.rpc.mockResolvedValue({ data: graded, error: null });
    const onResult = vi.fn();
    render(
      <AuthContext.Provider value={auth}>
        <OutboxSyncProvider>
          <Reviews onResult={onResult} />
        </OutboxSyncProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId('reviews')).toHaveTextContent('0'));
    expect(screen.getByTestId('lesson')).toHaveTextContent('0');
    expect(mocks.rpc).toHaveBeenCalledWith('grade_review', args);
    expect(mocks.rpc).not.toHaveBeenCalledWith('submit_exercise', expect.anything());
    expect(onResult).toHaveBeenCalledWith(args.p_idempotency_key, { result: graded }, expect.objectContaining({ args }));
  });

  it('counts lesson and review entries separately', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 });
    createReviewOutbox(USER_ID).add({ args: gradeArgs(1), queueIndex: 0 });
    createReviewOutbox(USER_ID).add({ args: gradeArgs(2), queueIndex: 1 });
    createOutbox(USER_ID).add({ args: submitArgs(), queueIndex: 0 });
    render(
      <AuthContext.Provider value={auth}>
        <OutboxSyncProvider>
          <Reviews onResult={vi.fn()} />
        </OutboxSyncProvider>
      </AuthContext.Provider>,
    );
    expect(screen.getByTestId('lesson')).toHaveTextContent('1');
    expect(screen.getByTestId('reviews')).toHaveTextContent('2');
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('grade_review', expect.anything()));
    expect(screen.getByTestId('reviews')).toHaveTextContent('2');
  });
});
