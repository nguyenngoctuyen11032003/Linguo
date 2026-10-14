import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { LIST_ID, fakeVocabClient, personalCard, personalWord, type FakeRpcResponse } from './personal-fixtures';
import { usePersonalReview } from './usePersonalReview';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

function wrapper({ children }: { children: ReactNode }) {
  const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };
  return (
    <ToastProvider>
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    </ToastProvider>
  );
}

const w1 = personalWord();
const w2 = personalWord();
const queue = (...words: ReturnType<typeof personalWord>[]) => ({
  cards: words.map((w) => personalCard(w)),
  totals: { due_total: words.length, served: words.length, new_available: words.length },
});
const graded = (id: string): FakeRpcResponse => ({ data: { word_id: id, state: 'learning', due_at: '2026-10-14T00:10:00Z', interval_minutes: 10, replayed: false } });

afterEach(() => {
  mocks.client = null;
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

  it('keeps the card and reuses the idempotency key when the grade got no answer', async () => {
    let attempts = 0;
    const client = fakeVocabClient((name) => {
      if (name === 'get_personal_review_queue') return { data: queue(w1) };
      attempts += 1;
      return attempts === 1 ? { error: { message: 'TypeError: Failed to fetch', code: '' } } : graded(w1.id);
    });
    mocks.client = client;
    const { result } = renderHook(() => usePersonalReview(LIST_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.flip());
    await act(() => result.current.grade(3));
    expect(result.current.status).toBe('ready');
    expect(result.current.cardState).toBe('back');
    await act(() => result.current.grade(3));
    expect(result.current.status).toBe('finished');
    const keys = client.calls.filter(([n]) => n === 'grade_personal_word').map(([, a]) => a.p_idempotency_key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
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
