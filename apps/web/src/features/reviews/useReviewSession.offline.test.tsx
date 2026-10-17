import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import { OutboxSyncProvider } from '@/features/lesson-player/OutboxSyncProvider';
import { createReviewOutbox } from './outbox';
import { readReviewQueueCache, writeReviewQueueCache } from './queueCache';
import { PATH_ID, card, cardId, gradeArgs, queue } from './review-fixtures';
import type { GradeMeta } from './types';
import { useReviewSession } from './useReviewSession';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NETWORK = { message: 'TypeError: Failed to fetch', code: '' };
const META: GradeMeta = { confidence: null, responseMs: 900, hintCount: 0 };

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

function wrapper() {
  const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };
  const paths: LearningPathsContextValue = {
    status: 'ready',
    error: null,
    paths: [],
    currentId: PATH_ID,
    current: null,
    reload: vi.fn(),
    setCurrent: vi.fn(),
    upsertPath: vi.fn(),
  };
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <OutboxSyncProvider>
            <LearningPathsContext.Provider value={paths}>{children}</LearningPathsContext.Provider>
          </OutboxSyncProvider>
        </AuthContext.Provider>
      </ToastProvider>
    );
  };
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

const queueCalls = () => mocks.rpc.mock.calls.filter(([name]) => name === 'get_review_queue');

afterEach(() => {
  localStorage.clear();
  mocks.rpc.mockReset();
  setOnline(true);
});

describe('useReviewSession from the saved queue', () => {
  it('runs offline from the saved queue without asking the server, minus cards waiting in the outbox', async () => {
    writeReviewQueueCache(USER_ID, PATH_ID, queue([card(1), card(2), card(3)]));
    createReviewOutbox(USER_ID).add({ args: gradeArgs(1), queueIndex: 0 });
    setOnline(false);
    mocks.rpc.mockResolvedValue({ data: null, error: NETWORK, status: 0 });
    const { result: hook } = renderHook(() => useReviewSession(), { wrapper: wrapper() });
    await waitFor(() => expect(hook.current.status).toBe('ready'));
    expect(queueCalls()).toEqual([]);
    expect(hook.current.fromCache).toBe(true);
    expect(hook.current.total).toBe(2);
    expect(hook.current.card?.card_id).toBe(cardId(2));
  });

  it('grading offline queues the grade and removes the card from the saved queue', async () => {
    writeReviewQueueCache(USER_ID, PATH_ID, queue([card(1), card(2)]));
    setOnline(false);
    mocks.rpc.mockResolvedValue({ data: null, error: NETWORK, status: 0 });
    const { result: hook } = renderHook(() => useReviewSession(), { wrapper: wrapper() });
    await waitFor(() => expect(hook.current.status).toBe('ready'));
    act(() => hook.current.flip());
    await act(async () => {
      await hook.current.grade(3, META);
    });
    expect(createReviewOutbox(USER_ID).list().map((e) => e.args.p_card_id)).toEqual([cardId(1)]);
    expect(readReviewQueueCache(USER_ID, PATH_ID)?.data.cards.map((c) => c.card_id)).toEqual([cardId(2)]);
    expect(hook.current.card?.card_id).toBe(cardId(2));
  });

  it('falls back to the saved queue when the request gets no answer', async () => {
    writeReviewQueueCache(USER_ID, PATH_ID, queue([card(1)]));
    mocks.rpc.mockResolvedValue({ data: null, error: NETWORK, status: 0 });
    const { result: hook } = renderHook(() => useReviewSession(), { wrapper: wrapper() });
    await waitFor(() => expect(hook.current.status).toBe('ready'));
    expect(queueCalls()).toHaveLength(1);
    expect(hook.current.fromCache).toBe(true);
    expect(hook.current.card?.card_id).toBe(cardId(1));
  });

  it('does not use the saved queue for a server refusal, and reports the error without one', async () => {
    writeReviewQueueCache(USER_ID, PATH_ID, queue([card(1)]));
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'path_not_active', code: 'P0001' } });
    const refused = renderHook(() => useReviewSession(), { wrapper: wrapper() });
    await waitFor(() => expect(refused.result.current.status).toBe('error'));
    refused.unmount();
    localStorage.clear();
    mocks.rpc.mockResolvedValue({ data: null, error: NETWORK, status: 0 });
    const none = renderHook(() => useReviewSession(), { wrapper: wrapper() });
    await waitFor(() => expect(none.result.current.status).toBe('error'));
    expect(none.result.current.error).toMatch(/Không kết nối/);
  });

  it('postponing and extra cards need the network: offline they only explain, without a request', async () => {
    writeReviewQueueCache(USER_ID, PATH_ID, queue([card(1), card(2)]));
    setOnline(false);
    const { result: hook } = renderHook(() => useReviewSession(), { wrapper: wrapper() });
    await waitFor(() => expect(hook.current.status).toBe('ready'));
    await act(async () => {
      await hook.current.postpone();
      await hook.current.loadMore();
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await screen.findAllByText(/Cần có mạng/)).length).toBeGreaterThan(0);
  });
});
