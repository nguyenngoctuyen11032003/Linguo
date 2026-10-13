import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import { OutboxSyncProvider } from '@/features/lesson-player/OutboxSyncProvider';
import { createReviewOutbox } from './outbox';
import { PATH_ID, card, cardId, gradeArgs, gradeResult, queue, summary } from './review-fixtures';
import type { GradeMeta } from './types';
import { useReviewSession } from './useReviewSession';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NETWORK = { message: 'TypeError: Failed to fetch', code: '' };
const META: GradeMeta = { confidence: null, responseMs: 1234.4, hintCount: 0 };

type Handler = (args: Record<string, unknown>) => { data?: unknown; error?: unknown; status?: number };

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));

function installClient(handlers: Record<string, Handler>) {
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    const handler = handlers[name];
    if (!handler) return Promise.resolve({ data: null, error: { message: `no fake for ${name}`, code: 'X' } });
    const { data = null, error = null, status } = handler(args);
    return Promise.resolve({ data, error, ...(status === undefined ? {} : { status }) });
  });
  mocks.client = { rpc };
  const callsOf = (name: string) => rpc.mock.calls.filter(([n]) => n === name).map(([, a]) => a);
  return { rpc, callsOf };
}

function wrapper(pathId: string | null = PATH_ID, pathsStatus: LearningPathsContextValue['status'] = 'ready') {
  const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };
  const paths: LearningPathsContextValue = {
    status: pathsStatus,
    error: null,
    paths: [],
    currentId: pathId,
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

function renderSession(pathId: string | null = PATH_ID, pathsStatus: LearningPathsContextValue['status'] = 'ready') {
  return renderHook(() => useReviewSession(), { wrapper: wrapper(pathId, pathsStatus) });
}

function goOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

async function ready(hook: ReturnType<typeof renderSession>['result']) {
  await waitFor(() => expect(hook.current.status).toBe('ready'));
}

afterEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('useReviewSession', () => {
  it('loads the queue of the current path and starts on the front of the first card', async () => {
    const fake = installClient({ get_review_queue: () => ({ data: queue([card(1), card(2)]) }) });
    const { result: hook } = renderSession();
    expect(hook.current.status).toBe('loading');
    await ready(hook);
    expect(fake.callsOf('get_review_queue')).toEqual([{ p_path_id: PATH_ID, p_limit: 20, p_extra: false }]);
    expect(hook.current.card?.card_id).toBe(cardId(1));
    expect(hook.current.position).toBe(0);
    expect(hook.current.total).toBe(2);
    expect(hook.current.cardState).toEqual({ status: 'front' });
    expect(hook.current.totals?.daily_cap).toBe(30);
  });

  it('asks for at most the study session review limit', async () => {
    const fake = installClient({ get_review_queue: () => ({ data: queue([card(1)]) }) });
    const { result: hook } = renderHook(() => useReviewSession({ limit: 7 }), { wrapper: wrapper() });
    await ready(hook);
    expect(fake.callsOf('get_review_queue')).toEqual([{ p_path_id: PATH_ID, p_limit: 7, p_extra: false }]);
  });

  it('is empty when nothing is due, and loads the summary', async () => {
    const fake = installClient({
      get_review_queue: () => ({ data: queue([]) }),
      review_summary: () => ({ data: summary({ remaining_today: 0 }) }),
    });
    const { result: hook } = renderSession();
    await waitFor(() => expect(hook.current.status).toBe('empty'));
    expect(hook.current.card).toBeNull();
    await waitFor(() => expect(hook.current.summary?.remaining_today).toBe(0));
    expect(fake.callsOf('review_summary')).toEqual([{ p_path_id: PATH_ID }]);
  });

  it('flips, grades with a fresh idempotency key and advances; the summary follows the last card', async () => {
    const fake = installClient({
      get_review_queue: () => ({ data: queue([card(1), card(2)]) }),
      grade_review: (args) => ({ data: gradeResult(args.p_card_id === cardId(1) ? 1 : 2) }),
      review_summary: () => ({ data: summary() }),
    });
    const { result: hook } = renderSession();
    await ready(hook);
    act(() => hook.current.flip());
    expect(hook.current.cardState).toEqual({ status: 'back' });
    await act(() => hook.current.grade(3, { ...META, confidence: 2 }));
    const [first] = fake.callsOf('grade_review');
    expect(first).toMatchObject({
      p_card_id: cardId(1),
      p_rating: 3,
      p_confidence: 2,
      p_response_ms: 1234,
      p_hint_count: 0,
    });
    expect(first?.p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(hook.current.position).toBe(1);
    expect(hook.current.card?.card_id).toBe(cardId(2));
    expect(hook.current.cardState).toEqual({ status: 'front' });
    expect(hook.current.graded).toEqual([gradeResult(1)]);

    await act(() => hook.current.grade(4, META));
    const keys = fake.callsOf('grade_review').map((a) => a.p_idempotency_key);
    expect(new Set(keys).size).toBe(2);
    expect(hook.current.status).toBe('finished');
    expect(hook.current.card).toBeNull();
    expect(hook.current.position).toBe(2);
    await waitFor(() => expect(hook.current.summary).toEqual(summary()));
  });

  it('ignores a double grade while the first is in flight', async () => {
    let resolve: (() => void) | null = null;
    const fake = installClient({ get_review_queue: () => ({ data: queue([card(1), card(2)]) }) });
    const rpc = fake.rpc.getMockImplementation()!;
    fake.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name !== 'grade_review') return rpc(name, args);
      return new Promise((r) => {
        resolve = () => r({ data: gradeResult(1), error: null });
      });
    });
    const { result: hook } = renderSession();
    await ready(hook);
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = hook.current.grade(3, META);
    });
    expect(hook.current.cardState).toEqual({ status: 'submitting' });
    await act(() => hook.current.grade(3, META));
    expect(fake.callsOf('grade_review')).toHaveLength(1);
    await act(async () => {
      resolve!();
      await first;
    });
    expect(hook.current.position).toBe(1);
  });

  it('queues a grade that got no answer, shows it pending and moves on; the replay result lands later', async () => {
    let offline = true;
    installClient({
      get_review_queue: () => ({ data: queue([card(1), card(2)]) }),
      grade_review: () => (offline ? { error: NETWORK, status: 0 } : { data: gradeResult(1, { replayed: true }) }),
    });
    const { result: hook } = renderSession();
    await ready(hook);
    await act(() => hook.current.grade(1, META));
    const queued = createReviewOutbox(USER_ID).list();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.args).toMatchObject({ p_card_id: cardId(1), p_rating: 1 });
    expect(hook.current.card?.card_id).toBe(cardId(2));
    expect(hook.current.pendingCount).toBe(1);

    offline = false;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(hook.current.pendingCount).toBe(0));
    expect(hook.current.graded).toEqual([gradeResult(1, { replayed: true })]);
    expect(createReviewOutbox(USER_ID).list()).toEqual([]);
  });

  it('never counts an unconfirmed grade as saved, and resends it under the key it was first sent with', async () => {
    let down = true;
    const fake = installClient({
      get_review_queue: () => ({ data: queue([card(1), card(2)]) }),
      grade_review: () => (down ? { error: { message: 'AbortError: signal timed out', code: '' }, status: 0 } : { data: gradeResult(1) }),
    });
    const { result: hook } = renderSession();
    await ready(hook);
    await act(() => hook.current.grade(2, META));
    const [sent] = fake.callsOf('grade_review');
    const [queued] = createReviewOutbox(USER_ID).list();
    expect(queued!.args.p_idempotency_key).toBe(sent!.p_idempotency_key);
    // Pending, not graded: no result is shown as saved until the server answers.
    expect(hook.current.pendingCount).toBe(1);
    expect(hook.current.graded).toEqual([]);

    down = false;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(hook.current.pendingCount).toBe(0));
    expect(new Set(fake.callsOf('grade_review').map((a) => a.p_idempotency_key))).toEqual(new Set([sent!.p_idempotency_key]));
    expect(hook.current.graded).toEqual([gradeResult(1)]);
  });

  it('queues straight to the outbox when the browser is offline (timeouts and 5xx too)', async () => {
    const fake = installClient({
      get_review_queue: () => ({ data: queue([card(1), card(2), card(3)]) }),
      grade_review: () => ({ error: { message: 'Bad gateway', code: '' }, status: 502 }),
    });
    const { result: hook } = renderSession();
    await ready(hook);
    goOnline(false);
    await act(() => hook.current.grade(3, META));
    expect(fake.callsOf('grade_review')).toEqual([]);
    expect(hook.current.position).toBe(1);
    goOnline(true);
    await act(() => hook.current.grade(3, META));
    expect(hook.current.position).toBe(2);
    expect(createReviewOutbox(USER_ID).list().map((e) => e.args.p_card_id)).toEqual([cardId(1), cardId(2)]);
  });

  it('keeps the card on screen and shows the error when the server refuses the grade', async () => {
    installClient({
      get_review_queue: () => ({ data: queue([card(1)]) }),
      grade_review: () => ({ error: { message: 'card_suspended', code: 'P0001' }, status: 400 }),
    });
    const { result: hook } = renderSession();
    await ready(hook);
    act(() => hook.current.flip());
    await act(() => hook.current.grade(2, META));
    expect(hook.current.card?.card_id).toBe(cardId(1));
    expect(hook.current.cardState).toEqual({ status: 'back' });
    expect(createReviewOutbox(USER_ID).list()).toEqual([]);
    expect(await screen.findByText('Thẻ này đang tạm ẩn.')).toBeInTheDocument();
  });

  it('reports an outbox that cannot be written instead of showing the grade as pending', async () => {
    installClient({ get_review_queue: () => ({ data: queue([card(1)]) }) });
    const { result: hook } = renderSession();
    await ready(hook);
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    goOnline(false);
    await act(() => hook.current.grade(3, META));
    setItem.mockRestore();
    expect(hook.current.card?.card_id).toBe(cardId(1));
    expect(hook.current.cardState).toEqual({ status: 'back' });
    expect(await screen.findByText(/^Không lưu được lượt chấm/)).toBeInTheDocument();
  });

  it('does not serve again a card whose grade still waits in the outbox', async () => {
    createReviewOutbox(USER_ID).add({ args: gradeArgs(1), queueIndex: 0 });
    installClient({
      get_review_queue: () => ({ data: queue([card(1), card(2)]) }),
      grade_review: () => ({ error: NETWORK, status: 0 }),
    });
    const { result: hook } = renderSession();
    await ready(hook);
    expect(hook.current.total).toBe(1);
    expect(hook.current.card?.card_id).toBe(cardId(2));
  });

  it('postpones the current card and moves on', async () => {
    const fake = installClient({
      get_review_queue: () => ({ data: queue([card(1), card(2)]) }),
      postpone_reviews: () => ({ data: { postponed: 1, skipped: 0, replayed: false } }),
    });
    const { result: hook } = renderSession();
    await ready(hook);
    await act(() => hook.current.postpone());
    expect(fake.callsOf('postpone_reviews')).toEqual([
      { p_path_id: PATH_ID, p_card_ids: [cardId(1)], p_idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    ]);
    expect(hook.current.card?.card_id).toBe(cardId(2));
    expect(hook.current.total).toBe(1);
    expect(hook.current.position).toBe(0);
  });

  it('keeps a card the server would not postpone again', async () => {
    installClient({
      get_review_queue: () => ({ data: queue([card(1), card(2)]) }),
      postpone_reviews: () => ({ data: { postponed: 0, skipped: 1, replayed: false } }),
    });
    const { result: hook } = renderSession();
    await ready(hook);
    await act(() => hook.current.postpone());
    expect(hook.current.card?.card_id).toBe(cardId(1));
    expect(await screen.findByText(/đã được hoãn quá nhiều lần/)).toBeInTheDocument();
  });

  it('postpones every remaining card and finishes the session', async () => {
    const fake = installClient({
      get_review_queue: () => ({ data: queue([card(1), card(2), card(3)]) }),
      grade_review: () => ({ data: gradeResult(1) }),
      postpone_reviews: () => ({ data: { postponed: 2, skipped: 0, replayed: false } }),
      review_summary: () => ({ data: summary() }),
    });
    const { result: hook } = renderSession();
    await ready(hook);
    await act(() => hook.current.grade(3, META));
    await act(() => hook.current.postpone(true));
    expect(fake.callsOf('postpone_reviews')).toEqual([
      { p_path_id: PATH_ID, p_card_ids: null, p_idempotency_key: expect.any(String) },
    ]);
    expect(hook.current.status).toBe('finished');
    expect(hook.current.total).toBe(1);
    expect(hook.current.graded).toHaveLength(1);
    await waitFor(() => expect(hook.current.summary).toEqual(summary()));
  });

  it('loads 10 more cards after the session, skipping cards already served', async () => {
    let calls = 0;
    const fake = installClient({
      get_review_queue: () => {
        calls += 1;
        return { data: calls === 1 ? queue([card(1)]) : queue([card(1), card(5), card(6)], { daily_cap: 40 }) };
      },
      grade_review: () => ({ data: gradeResult(1) }),
      review_summary: () => ({ data: summary() }),
    });
    const { result: hook } = renderSession();
    await ready(hook);
    await act(() => hook.current.grade(3, META));
    await waitFor(() => expect(hook.current.summary).not.toBeNull());
    await act(() => hook.current.loadMore());
    expect(fake.callsOf('get_review_queue')[1]).toEqual({ p_path_id: PATH_ID, p_limit: 10, p_extra: true });
    expect(hook.current.status).toBe('ready');
    expect(hook.current.summary).toBeNull();
    expect(hook.current.total).toBe(3);
    expect(hook.current.position).toBe(1);
    expect(hook.current.card?.card_id).toBe(cardId(5));
    expect(hook.current.totals?.daily_cap).toBe(40);
  });

  it('stays finished when there is nothing more to serve', async () => {
    let calls = 0;
    installClient({
      get_review_queue: () => {
        calls += 1;
        return { data: calls === 1 ? queue([card(1)]) : queue([]) };
      },
      grade_review: () => ({ data: gradeResult(1) }),
      review_summary: () => ({ data: summary() }),
    });
    const { result: hook } = renderSession();
    await ready(hook);
    await act(() => hook.current.grade(3, META));
    await act(() => hook.current.loadMore());
    expect(hook.current.status).toBe('finished');
    expect(await screen.findByText('Không còn thẻ nào để ôn thêm hôm nay.')).toBeInTheDocument();
  });

  it('shows a Vietnamese error and retries', async () => {
    let fail = true;
    const fake = installClient({
      get_review_queue: () => (fail ? { error: { message: 'path_not_active', code: 'P0001' } } : { data: queue([card(1)]) }),
    });
    const { result: hook } = renderSession();
    await waitFor(() => expect(hook.current.status).toBe('error'));
    expect(hook.current.error).toBe('Lộ trình này đang tạm dừng. Hãy bật lại lộ trình để ôn tập.');
    fail = false;
    act(() => hook.current.retry());
    await ready(hook);
    expect(fake.callsOf('get_review_queue')).toHaveLength(2);
  });

  it('waits for the learning paths, then errors without a path', async () => {
    const fake = installClient({});
    const loading = renderSession(null, 'loading');
    expect(loading.result.current.status).toBe('loading');
    loading.unmount();
    const { result: hook } = renderSession(null, 'ready');
    await waitFor(() => expect(hook.current.status).toBe('error'));
    expect(hook.current.error).toBe('Không tìm thấy lộ trình.');
    expect(fake.callsOf('get_review_queue')).toEqual([]);
  });
});
