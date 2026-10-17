import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { OutboxSyncProvider } from '@/features/lesson-player/OutboxSyncProvider';
import { personalVocabErrorMessage } from './error-map';
import { createPersonalOutbox } from './outbox';
import { LIST_ID, fakeVocabClient, personalCard, personalList, personalWord, type FakeRpcResponse } from './personal-fixtures';
import { dropWordFromPersonalQueueCache, prefetchPersonalQueues, readPersonalQueueCache } from './queueCache';
import { usePersonalLists } from './usePersonalLists';
import { usePersonalReview } from './usePersonalReview';
import { usePersonalWords } from './usePersonalWords';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NETWORK: FakeRpcResponse = { error: { message: 'TypeError: Failed to fetch', code: '' } };

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

const w1 = personalWord();
const w2 = personalWord();
const queue = (...words: ReturnType<typeof personalWord>[]) => ({
  cards: words.map((w) => personalCard(w)),
  totals: { due_total: words.length, served: words.length, new_available: words.length },
});

afterEach(() => {
  mocks.client = null;
  localStorage.clear();
  setOnline(true);
});

describe('personal vocabulary offline', () => {
  it('saves the due words after the lists load online, then reviews them offline from the saved queue', async () => {
    const client = fakeVocabClient((name) => {
      if (name === 'list_personal_lists') return { data: [personalList({ due_count: 2 })] };
      if (name === 'get_personal_review_queue') return { data: queue(w1, w2) };
      return NETWORK;
    });
    mocks.client = client;
    const lists = renderHook(() => usePersonalLists(), { wrapper });
    await waitFor(() => expect(readPersonalQueueCache(USER_ID, LIST_ID)?.data.cards).toHaveLength(2));
    expect(client.calls.find(([n]) => n === 'get_personal_review_queue')?.[1]).toEqual({ p_list_id: LIST_ID, p_limit: 100 });
    lists.unmount();

    setOnline(false);
    createPersonalOutbox(USER_ID).add({ args: { p_word_id: w1.id, p_rating: 3, p_idempotency_key: crypto.randomUUID() }, queueIndex: 0 });
    const before = client.calls.length;
    const review = renderHook(() => usePersonalReview(LIST_ID), { wrapper });
    await waitFor(() => expect(review.result.current.status).toBe('ready'));
    expect(client.calls.length).toBe(before);
    expect(review.result.current.fromCache).toBe(true);
    expect(review.result.current.total).toBe(1);
    expect(review.result.current.card?.card_id).toBe(w2.id);

    act(() => review.result.current.flip());
    await act(() => review.result.current.grade(3));
    expect(readPersonalQueueCache(USER_ID, LIST_ID)?.data.cards.map((c) => c.card_id) ?? []).not.toContain(w2.id);
    expect(createPersonalOutbox(USER_ID).list().map((e) => e.args.p_word_id)).toContain(w2.id);
  });

  it('shows the saved lists and words when the network is gone', async () => {
    const client = fakeVocabClient((name) => (name === 'list_personal_lists' ? { data: [personalList()] } : { data: null }));
    mocks.client = client;
    const online = renderHook(() => usePersonalLists(), { wrapper });
    await waitFor(() => expect(online.result.current.lists).toHaveLength(1));
    online.unmount();

    setOnline(false);
    const offline = renderHook(() => usePersonalLists(), { wrapper });
    await waitFor(() => expect(offline.result.current.stale).toBe(true));
    expect(offline.result.current.status).toBe('ready');
    expect(offline.result.current.lists.map((l) => l.id)).toEqual([LIST_ID]);

    const words = renderHook(() => usePersonalWords(LIST_ID), { wrapper });
    await waitFor(() => expect(words.result.current.status).toBe('error')); // never loaded: nothing saved
  });

  it('creating, renaming, importing, editing and deleting say they need the network, without a request', async () => {
    const client = fakeVocabClient(() => ({ data: [] }));
    mocks.client = client;
    setOnline(false);
    const lists = renderHook(() => usePersonalLists(), { wrapper });
    const words = renderHook(() => usePersonalWords(LIST_ID), { wrapper });
    const calls = client.calls.length;
    const rejects = async (p: Promise<unknown>) => {
      const error = await p.then(
        () => null,
        (e: unknown) => e,
      );
      expect(personalVocabErrorMessage(error)).toMatch(/Cần có mạng/);
    };
    await rejects(lists.result.current.create('x', 'en'));
    await rejects(lists.result.current.rename(LIST_ID, 'y'));
    await rejects(lists.result.current.remove(LIST_ID));
    await rejects(words.result.current.importRows([]));
    await rejects(words.result.current.update(w1.id, { term: 'a', meaning: 'b', example: null, note: null, pronunciation: null }));
    await rejects(words.result.current.remove(w1.id));
    expect(client.calls.length).toBe(calls);
  });

  it('prefetch skips lists with nothing due, keeps going per list, and drops a graded word', async () => {
    const client = fakeVocabClient(() => ({ data: queue(w1, w2) }));
    mocks.client = client;
    await prefetchPersonalQueues(client as never, USER_ID, [personalList({ due_count: 0 })]);
    expect(client.calls).toEqual([]);
    await prefetchPersonalQueues(client as never, USER_ID, [personalList({ due_count: 2 })]);
    expect(readPersonalQueueCache(USER_ID, LIST_ID)?.data.cards).toHaveLength(2);
    dropWordFromPersonalQueueCache(USER_ID, LIST_ID, w1.id);
    expect(readPersonalQueueCache(USER_ID, LIST_ID)?.data.cards.map((c) => c.card_id)).toEqual([w2.id]);
  });
});
