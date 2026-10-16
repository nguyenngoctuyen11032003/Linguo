import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { OutboxSyncProvider } from '@/features/lesson-player/OutboxSyncProvider';
import { createPersonalOutbox } from './outbox';
import { LIST_ID, fakeVocabClient, personalCard, personalWord, type FakeRpcResponse } from './personal-fixtures';
import { usePersonalReview } from './usePersonalReview';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

function wrapper({ children }: { children: ReactNode }) {
  const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };
  return (
    <ToastProvider>
      <AuthContext.Provider value={auth}>
        <OutboxSyncProvider>{children}</OutboxSyncProvider>
      </AuthContext.Provider>
    </ToastProvider>
  );
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

/** Back online: useOnline re-reads navigator.onLine and OutboxSyncProvider flushes. */
async function goOnline() {
  setOnline(true);
  await act(async () => {
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
  });
}

const w1 = personalWord();
const w2 = personalWord();
const w3 = personalWord();
const queue = (...words: ReturnType<typeof personalWord>[]) => ({
  cards: words.map((w) => personalCard(w)),
  totals: { due_total: words.length, served: words.length, new_available: words.length },
});
const graded = (id: string): FakeRpcResponse => ({ data: { word_id: id, state: 'learning', due_at: '2026-10-14T00:10:00Z', interval_minutes: 10, replayed: false } });
const NETWORK: FakeRpcResponse = { error: { message: 'TypeError: Failed to fetch', code: '' } };
const gradeCalls = (client: ReturnType<typeof fakeVocabClient>) => client.calls.filter(([n]) => n === 'grade_personal_word').map(([, a]) => a);

afterEach(() => {
  mocks.client = null;
  localStorage.clear();
  setOnline(true);
});

describe('usePersonalReview', () => {
  it('loads the queue, flips and grades each word, then finishes', async () => {
    const client = fakeVocabClient((name, args) => (name === 'get_personal_review_queue' ? { data: queue(w1, w2) } : graded(String(args.p_word_id))));
    mocks.client = client;
    const { result } = renderHook(() => usePersonalReview(LIST_ID), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.total).toBe(2);
    expect(result.current.card?.card_id).toBe(w1.id);
    expect(client.calls[0]).toEqual(['get_personal_review_queue', { p_list_id: LIST_ID, p_limit: 20 }]);

    // Grading before the flip is ignored.
    await act(() => result.current.grade(3));
    expect(client.calls).toHaveLength(1);

    act(() => result.current.flip());
    expect(result.current.cardState).toBe('back');
    await act(() => result.current.grade(3));
    expect(result.current.position).toBe(1);
    expect(result.current.cardState).toBe('front');
    expect(client.calls[1]?.[1]).toMatchObject({ p_word_id: w1.id, p_rating: 3 });

    act(() => result.current.flip());
    await act(() => result.current.grade(4));
    expect(result.current.status).toBe('finished');
    expect(result.current.graded).toHaveLength(2);
    expect(result.current.queued).toEqual([]);
    expect(result.current.pendingCount).toBe(0);
  });

  it('is empty when nothing is due', async () => {
    mocks.client = fakeVocabClient(() => ({ data: queue() }));
    const { result } = renderHook(() => usePersonalReview(LIST_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('empty'));
  });

  it('maps a load error and reloads on retry', async () => {
    let fail = true;
    mocks.client = fakeVocabClient(() => (fail ? { error: { message: 'list_not_found', code: 'P0001' } } : { data: queue(w1) }));
    const { result } = renderHook(() => usePersonalReview(LIST_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Không tìm thấy danh sách này. Có thể nó đã bị xoá.');
    fail = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('queues a grade that got no answer, moves on, and replays it with the same key once back online', async () => {
    let down = true;
    const client = fakeVocabClient((name, args) => {
      if (name === 'get_personal_review_queue') return { data: queue(w1, w2) };
      return down ? NETWORK : graded(String(args.p_word_id));
    });
    mocks.client = client;
    const { result } = renderHook(() => usePersonalReview(LIST_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.flip());
    await act(() => result.current.grade(3));
    expect(result.current.position).toBe(1);
    expect(result.current.queued).toEqual([w1.id]);
    expect(result.current.pendingCount).toBe(1);
    const queued = createPersonalOutbox(USER_ID).list();
    expect(queued.map((e) => e.args)).toEqual([gradeCalls(client)[0]]);

    down = false;
    await goOnline();
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    const keys = gradeCalls(client).map((a) => a.p_idempotency_key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(result.current.queued).toEqual([]);
    expect(result.current.graded.map((g) => g.word_id)).toEqual([w1.id]);
  });

  it('finishes a session offline and sends the grades in order when the network returns', async () => {
    const client = fakeVocabClient((name, args) => (name === 'get_personal_review_queue' ? { data: queue(w1, w2, w3) } : graded(String(args.p_word_id))));
    mocks.client = client;
    const { result } = renderHook(() => usePersonalReview(LIST_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    setOnline(false);
    act(() => window.dispatchEvent(new Event('offline')));
    for (const rating of [1, 3, 4] as const) {
      act(() => result.current.flip());
      await act(() => result.current.grade(rating));
    }
    expect(result.current.status).toBe('finished');
    expect(gradeCalls(client)).toHaveLength(0);
    expect(result.current.queued).toEqual([w1.id, w2.id, w3.id]);
    expect(result.current.pendingCount).toBe(3);
    expect(createPersonalOutbox(USER_ID).list().map((e) => [e.args.p_word_id, e.args.p_rating])).toEqual([
      [w1.id, 1],
      [w2.id, 3],
      [w3.id, 4],
    ]);

    await goOnline();
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(gradeCalls(client).map((a) => a.p_word_id)).toEqual([w1.id, w2.id, w3.id]);
    expect(result.current.graded).toHaveLength(3);
    expect(result.current.queued).toEqual([]);
  });

  it('queues a new grade behind older waiting ones instead of overtaking them', async () => {
    const older = { p_word_id: w3.id, p_rating: 2 as const, p_idempotency_key: '7a000000-0000-4000-8000-000000000001' };
    // An earlier session's grade is waiting with backoff (its first replay failed).
    createPersonalOutbox(USER_ID).add({ args: older, queueIndex: 0, tries: 1, nextAttemptAt: Date.now() + 60_000 });
    let down = true;
    const client = fakeVocabClient((name, args) => {
      if (name === 'get_personal_review_queue') return { data: queue(w1) };
      return down ? NETWORK : graded(String(args.p_word_id));
    });
    mocks.client = client;
    const { result } = renderHook(() => usePersonalReview(LIST_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(gradeCalls(client)).toHaveLength(1)); // the provider's flush on mount
    down = false;
    act(() => result.current.flip());
    await act(() => result.current.grade(3));
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(gradeCalls(client).map((a) => a.p_word_id)).toEqual([w3.id, w3.id, w1.id]);
    expect(result.current.graded.map((g) => g.word_id)).toEqual([w1.id]);
  });

  it('drops a queued grade the server refuses and shows its error once', async () => {
    let answer: FakeRpcResponse = NETWORK;
    const client = fakeVocabClient((name) => (name === 'get_personal_review_queue' ? { data: queue(w1) } : answer));
    mocks.client = client;
    const { result } = renderHook(() => usePersonalReview(LIST_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.flip());
    await act(() => result.current.grade(3));
    expect(result.current.pendingCount).toBe(1);

    answer = { error: { message: 'idempotency_conflict', code: 'P0001' } };
    await goOnline();
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(await screen.findAllByText('Lượt chấm này đã được gửi với nội dung khác.')).toHaveLength(1);
    expect(createPersonalOutbox(USER_ID).list()).toEqual([]);
    expect(result.current.queued).toEqual([]);
    expect(result.current.graded).toEqual([]);

    // Another flush does not resend nor repeat the message.
    await goOnline();
    expect(gradeCalls(client)).toHaveLength(2);
    expect(screen.getAllByText('Lượt chấm này đã được gửi với nội dung khác.')).toHaveLength(1);
  });

  it('keeps the card when the server refuses a grade outright', async () => {
    const client = fakeVocabClient((name) => (name === 'get_personal_review_queue' ? { data: queue(w1) } : { error: { message: 'invalid_rating', code: 'P0001' } }));
    mocks.client = client;
    const { result } = renderHook(() => usePersonalReview(LIST_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.flip());
    await act(() => result.current.grade(3));
    expect(result.current.status).toBe('ready');
    expect(result.current.cardState).toBe('back');
    expect(result.current.pendingCount).toBe(0);
    expect(await screen.findByText('Mức đánh giá không hợp lệ.')).toBeInTheDocument();
  });

  it('does not serve again a word whose grade is still waiting', async () => {
    createPersonalOutbox(USER_ID).add({
      args: { p_word_id: w1.id, p_rating: 3, p_idempotency_key: '7a000000-0000-4000-8000-000000000002' },
      queueIndex: 0,
      tries: 1,
      nextAttemptAt: Date.now() + 60_000,
    });
    mocks.client = fakeVocabClient((name) => (name === 'get_personal_review_queue' ? { data: queue(w1, w2) } : NETWORK));
    const { result } = renderHook(() => usePersonalReview(LIST_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.total).toBe(1);
    expect(result.current.card?.card_id).toBe(w2.id);
  });

  it('skips a word that is no longer due', async () => {
    mocks.client = fakeVocabClient((name) => (name === 'get_personal_review_queue' ? { data: queue(w1, w2) } : { error: { message: 'word_not_due', code: 'P0001' } }));
    const { result } = renderHook(() => usePersonalReview(LIST_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.flip());
    await act(() => result.current.grade(2));
    expect(result.current.position).toBe(1);
    expect(result.current.graded).toHaveLength(0);
  });

  it('does not fetch without a list', () => {
    const client = fakeVocabClient(() => ({ data: queue() }));
    mocks.client = client;
    renderHook(() => usePersonalReview(null), { wrapper });
    expect(client.calls).toHaveLength(0);
  });
});
