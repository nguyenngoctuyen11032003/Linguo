import { act, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAllLocalLearnerData, clearLocalAccountData } from '@/features/account/service';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { createOutbox } from '@/features/lesson-player/outbox';
import { OutboxSyncProvider, useOutboxSyncContext, type OutboxSyncContextValue } from '@/features/lesson-player/OutboxSyncProvider';
import { createReviewOutbox } from '@/features/reviews/outbox';
import { submitArgs } from '@/features/lesson-player/lesson-fixtures';
import { gradeArgs as reviewGradeArgs } from '@/features/reviews/review-fixtures';
import {
  PERSONAL_OUTBOX_CHANNEL,
  createPersonalOutbox,
  personalOutboxKey,
  type PersonalGradeArgs,
  type PersonalOutboxResultHandler,
} from './outbox';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };

function args(n: number, rating: 1 | 2 | 3 | 4 = 3): PersonalGradeArgs {
  const id = String(n).padStart(12, '0');
  return { p_word_id: `9e100000-0000-4000-8000-${id}`, p_rating: rating, p_idempotency_key: `7a000000-0000-4000-8000-${id}` };
}

function result(a: PersonalGradeArgs) {
  return { word_id: a.p_word_id, state: 'learning', due_at: '2026-10-14T00:10:00Z', interval_minutes: 10, replayed: false };
}

const NETWORK = { message: 'TypeError: Failed to fetch', code: '' };

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mocks.rpc.mockReset();
});

describe('personal vocabulary outbox', () => {
  it('stores grades under linguo-personal-outbox-v1:<userId>, apart from lesson answers and review grades', () => {
    const outbox = createPersonalOutbox('u1');
    const a = args(1);
    expect(outbox.add({ args: a, queueIndex: 2, createdAt: '2026-10-16T08:00:00Z' })).toBe(true);
    expect(outbox.key).toBe('linguo-personal-outbox-v1:u1');
    expect(personalOutboxKey('u2')).toBe('linguo-personal-outbox-v1:u2');
    expect(JSON.parse(localStorage.getItem('linguo-personal-outbox-v1:u1')!)).toEqual([
      { args: a, queueIndex: 2, createdAt: '2026-10-16T08:00:00Z', tries: 0, nextAttemptAt: 0 },
    ]);
    expect(createOutbox('u1').list()).toEqual([]);
    expect(createReviewOutbox('u1').list()).toEqual([]);
  });

  it('keeps grades in the order they were queued and drops corrupt entries', () => {
    const valid = (a: PersonalGradeArgs) => ({ args: a, queueIndex: 0, createdAt: '2026-10-16T08:00:00Z', tries: 0, nextAttemptAt: 0 });
    const badRating = { ...valid(args(9)), args: { ...args(9), p_rating: 5 } };
    localStorage.setItem(personalOutboxKey('u1'), JSON.stringify([valid(args(1)), badRating, valid(args(2))]));
    const outbox = createPersonalOutbox('u1');
    outbox.add({ args: args(3), queueIndex: 1 });
    expect(outbox.list().map((e) => e.args.p_word_id)).toEqual([args(1), args(2), args(3)].map((a) => a.p_word_id));
  });

  it('dedupes by idempotency key and reports storage failures', () => {
    const outbox = createPersonalOutbox('u1');
    outbox.add({ args: args(1), queueIndex: 0 });
    outbox.add({ args: { ...args(1), p_rating: 1 }, queueIndex: 1 });
    expect(outbox.list()).toHaveLength(1);
    expect(createPersonalOutbox('u1', null).add({ args: args(2), queueIndex: 0 })).toBe(false);
  });

  it('replays through grade_personal_word under its own lock', async () => {
    expect(PERSONAL_OUTBOX_CHANNEL.lockName).toBe('linguo-personal-outbox');
    const a = args(1, 4);
    mocks.rpc.mockResolvedValue({ data: result(a), error: null });
    await PERSONAL_OUTBOX_CHANNEL.send(mocks.client as never, a);
    expect(mocks.rpc).toHaveBeenCalledWith('grade_personal_word', a);
  });

  it('is wiped on sign-out, while the lesson and review outboxes stay for the next sign-in', () => {
    createPersonalOutbox(USER_ID).add({ args: args(1), queueIndex: 0 });
    createPersonalOutbox('other-user').add({ args: args(2), queueIndex: 0 });
    createOutbox(USER_ID).add({ args: submitArgs(), queueIndex: 0 });
    createReviewOutbox(USER_ID).add({ args: reviewGradeArgs(1), queueIndex: 0 });
    clearAllLocalLearnerData(USER_ID, { mode: 'sign-out' });
    expect(createPersonalOutbox(USER_ID).list()).toEqual([]);
    expect(createPersonalOutbox('other-user').list()).toEqual([]);
    expect(localStorage.getItem(personalOutboxKey(USER_ID))).toBeNull();
    expect(createOutbox(USER_ID).list()).toHaveLength(1);
    expect(createReviewOutbox(USER_ID).list()).toHaveLength(1);
  });

  it('is wiped when the account is deleted', () => {
    createPersonalOutbox(USER_ID).add({ args: args(1), queueIndex: 0 });
    clearLocalAccountData(USER_ID);
    expect(localStorage.getItem(personalOutboxKey(USER_ID))).toBeNull();
  });
});

let ctx: OutboxSyncContextValue | null = null;

function Personal({ onResult }: { onResult: PersonalOutboxResultHandler }) {
  const value = useOutboxSyncContext();
  ctx = value;
  const { personalVocab } = value;
  useEffect(() => personalVocab.subscribe(onResult), [onResult, personalVocab]);
  return (
    <>
      <output data-testid="reviews">{value.reviews.pendingCount}</output>
      <output data-testid="personal">{personalVocab.pendingCount}</output>
    </>
  );
}

function renderProvider(onResult: PersonalOutboxResultHandler = vi.fn()) {
  return render(
    <AuthContext.Provider value={auth}>
      <OutboxSyncProvider>
        <Personal onResult={onResult} />
      </OutboxSyncProvider>
    </AuthContext.Provider>,
  );
}

describe('OutboxSyncProvider with personal vocabulary grades', () => {
  it('replays queued grades FIFO with their idempotency keys and hands results to personal subscribers', async () => {
    const a1 = args(1);
    const a2 = args(2, 1);
    createPersonalOutbox(USER_ID).add({ args: a1, queueIndex: 0 });
    createPersonalOutbox(USER_ID).add({ args: a2, queueIndex: 1 });
    mocks.rpc.mockImplementation((_name: string, a: PersonalGradeArgs) => Promise.resolve({ data: result(a), error: null }));
    const onResult = vi.fn();
    renderProvider(onResult);
    await waitFor(() => expect(screen.getByTestId('personal')).toHaveTextContent('0'));
    expect(mocks.rpc.mock.calls).toEqual([
      ['grade_personal_word', a1],
      ['grade_personal_word', a2],
    ]);
    expect(onResult).toHaveBeenNthCalledWith(1, a1.p_idempotency_key, { result: result(a1) }, expect.objectContaining({ args: a1 }));
    expect(onResult).toHaveBeenNthCalledWith(2, a2.p_idempotency_key, { result: result(a2) }, expect.objectContaining({ args: a2 }));
    expect(screen.getByTestId('reviews')).toHaveTextContent('0');
  });

  it('sends each grade once when flushes overlap', async () => {
    const a1 = args(1);
    let release: () => void = () => undefined;
    mocks.rpc.mockImplementation(
      (_name: string, a: PersonalGradeArgs) =>
        new Promise((resolve) => {
          release = () => resolve({ data: result(a), error: null });
        }),
    );
    createPersonalOutbox(USER_ID).add({ args: a1, queueIndex: 0 });
    renderProvider();
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    const flushes = [ctx!.personalVocab.flush(), ctx!.personalVocab.flush()];
    act(() => window.dispatchEvent(new Event('online')));
    release();
    await act(() => Promise.all(flushes));
    await waitFor(() => expect(screen.getByTestId('personal')).toHaveTextContent('0'));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps a grade that got no answer and stops there so later grades never overtake it', async () => {
    const a1 = args(1);
    const a2 = args(2);
    createPersonalOutbox(USER_ID).add({ args: a1, queueIndex: 0 });
    createPersonalOutbox(USER_ID).add({ args: a2, queueIndex: 1 });
    mocks.rpc.mockResolvedValue({ data: null, error: NETWORK });
    renderProvider();
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith('grade_personal_word', a1);
    const left = createPersonalOutbox(USER_ID).list();
    expect(left.map((e) => e.args)).toEqual([a1, a2]);
    expect(left[0]?.tries).toBe(1);
    expect(screen.getByTestId('personal')).toHaveTextContent('2');
  });

  it('drops a grade the server refuses and moves on to the next one', async () => {
    const a1 = args(1);
    const a2 = args(2);
    createPersonalOutbox(USER_ID).add({ args: a1, queueIndex: 0 });
    createPersonalOutbox(USER_ID).add({ args: a2, queueIndex: 1 });
    const refused = { message: 'invalid_rating', code: 'P0001' };
    mocks.rpc.mockImplementation((_name: string, a: PersonalGradeArgs) =>
      Promise.resolve(a.p_idempotency_key === a1.p_idempotency_key ? { data: null, error: refused } : { data: result(a), error: null }),
    );
    const onResult = vi.fn();
    renderProvider(onResult);
    await waitFor(() => expect(screen.getByTestId('personal')).toHaveTextContent('0'));
    expect(onResult).toHaveBeenCalledWith(a1.p_idempotency_key, { error: expect.objectContaining({ message: 'invalid_rating' }) }, expect.anything());
    expect(onResult).toHaveBeenCalledWith(a2.p_idempotency_key, { result: result(a2) }, expect.anything());
  });
});
