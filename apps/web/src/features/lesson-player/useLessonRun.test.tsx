import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import { EX1, EX2, LESSON_ID, PATH_ID, RUN_ID, attempt, payload, result, run } from './lesson-fixtures';
import { createOutbox } from './outbox';
import { lessonCacheKey, useLessonRun } from './useLessonRun';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NETWORK = { message: 'TypeError: Failed to fetch', code: '' };

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
  return { rpc, handlers, callsOf };
}

function wrapper(route: string, pathId: string | null = PATH_ID) {
  const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };
  const paths: LearningPathsContextValue = {
    status: 'ready',
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
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <AuthContext.Provider value={auth}>
            <LearningPathsContext.Provider value={paths}>{children}</LearningPathsContext.Provider>
          </AuthContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );
  };
}

function renderRun(route = `/app/hoc-tap/bai/${LESSON_ID}`, pathId: string | null = PATH_ID) {
  return renderHook(
    () => ({ api: useLessonRun(LESSON_ID), location: useLocation(), navigate: useNavigate() }),
    { wrapper: wrapper(route, pathId) },
  );
}

async function ready(hook: ReturnType<typeof renderRun>['result']) {
  await waitFor(() => expect(hook.current.api.status).toBe('ready'));
}

afterEach(() => {
  sessionStorage.clear();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('useLessonRun', () => {
  it('loads the lesson with its open run and mirrors the step in ?buoc=', async () => {
    const fake = installClient({ get_lesson: () => ({ data: payload() }) });
    const { result: hook } = renderRun();
    expect(hook.current.api.status).toBe('loading');
    await ready(hook);
    expect(fake.callsOf('get_lesson')).toEqual([{ p_lesson_id: LESSON_ID, p_path_id: PATH_ID }]);
    expect(fake.callsOf('start_lesson')).toEqual([]);
    expect(hook.current.api.lesson?.title).toEqual({ vi: 'Chào hỏi' });
    expect(Object.keys(hook.current.api.exercises)).toEqual([EX1, EX2]);
    expect(hook.current.api.steps).toHaveLength(8);
    expect(hook.current.api.stepIndex).toBe(0);
    expect(hook.current.api.step).toEqual({ kind: 'objective' });
    expect(hook.current.location.search).toBe('?buoc=1');
  });

  it('starts a run when there is no open one', async () => {
    const fake = installClient({
      get_lesson: () => ({ data: payload({ run: null }) }),
      start_lesson: () => ({ data: run() }),
    });
    const { result: hook } = renderRun();
    await ready(hook);
    expect(fake.callsOf('start_lesson')).toEqual([{ p_lesson_id: LESSON_ID, p_path_id: PATH_ID }]);
    expect(hook.current.api.steps).toHaveLength(8);
  });

  it('starts a fresh run (without old attempts) when the latest run is completed', async () => {
    const newRun = run({ id: '40000000-0000-4000-8000-000000000002' });
    installClient({
      get_lesson: () => ({ data: payload({ run: run({ status: 'completed' }), attempts: [attempt(EX1)] }) }),
      start_lesson: () => ({ data: newRun }),
    });
    const { result: hook } = renderRun();
    await ready(hook);
    expect(hook.current.api.exerciseState(EX1, 0).status).toBe('idle');
  });

  it('resumes from the saved cursor', async () => {
    installClient({ get_lesson: () => ({ data: payload({ run: run({ cursor: 4 }) }) }) });
    const { result: hook } = renderRun();
    await ready(hook);
    expect(hook.current.api.stepIndex).toBe(4);
    expect(hook.current.api.step).toMatchObject({ kind: 'exercise', exerciseId: EX1, queueIndex: 0 });
    expect(hook.current.location.search).toBe('?buoc=5');
  });

  it('prefers ?buoc= (1-based, clamped) over the cursor', async () => {
    installClient({ get_lesson: () => ({ data: payload({ run: run({ cursor: 4 }) }) }) });
    const { result: hook } = renderRun(`/app/hoc-tap/bai/${LESSON_ID}?buoc=3`);
    await ready(hook);
    expect(hook.current.api.stepIndex).toBe(2);

    const { result: clamped } = renderRun(`/app/hoc-tap/bai/${LESSON_ID}?buoc=99`);
    await ready(clamped);
    expect(clamped.current.api.stepIndex).toBe(7);
    expect(clamped.current.location.search).toBe('?buoc=8');
  });

  it('navigates steps, follows browser history and saves the cursor (debounced, only forward)', async () => {
    const fake = installClient({ get_lesson: () => ({ data: payload() }), save_lesson_cursor: () => ({ data: null }) });
    const { result: hook } = renderRun();
    await ready(hook);
    act(() => hook.current.api.next());
    act(() => hook.current.api.next());
    expect(hook.current.api.stepIndex).toBe(2);
    expect(hook.current.location.search).toBe('?buoc=3');
    await waitFor(() => expect(fake.callsOf('save_lesson_cursor')).toEqual([{ p_run_id: RUN_ID, p_cursor: 2 }]));

    act(() => hook.current.api.back());
    expect(hook.current.api.stepIndex).toBe(1);
    act(() => hook.current.navigate(-1)); // browser back
    await waitFor(() => expect(hook.current.api.stepIndex).toBe(2));
    act(() => hook.current.api.goTo(0));
    expect(hook.current.location.search).toBe('?buoc=1');
    await new Promise((r) => setTimeout(r, 600));
    expect(fake.callsOf('save_lesson_cursor')).toHaveLength(1);
  });

  it('submits an answer and shows the graded result', async () => {
    const graded = result({ verdict: 'almost', score: 0.8 });
    const fake = installClient({ get_lesson: () => ({ data: payload({ run: run({ cursor: 4 }) }) }), submit_exercise: () => ({ data: graded }) });
    const { result: hook } = renderRun();
    await ready(hook);
    await act(() => hook.current.api.submit(EX2, 1, { option_id: 'a' }, { confidence: 3, responseMs: 1234.4, hintCount: 1 }));
    const [args] = fake.callsOf('submit_exercise');
    expect(args).toMatchObject({
      p_run_id: RUN_ID,
      p_exercise_id: EX2,
      p_exercise_version: 1,
      p_response: { option_id: 'a' },
      p_confidence: 3,
      p_response_ms: 1234,
      p_hint_count: 1,
    });
    expect(args!.p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(String(args!.p_client_at)))).toBe(false);
    expect(hook.current.api.exerciseState(EX2, 1)).toEqual({ status: 'graded', attempts: 1, lastResult: graded });
    // EX1 (step index 4) has no answer yet.
    expect(hook.current.api.unresolved).toEqual([4]);
    expect(hook.current.api.canComplete).toBe(false);
  });

  it('only allows completing once every queue entry has a final result', async () => {
    const fake = installClient({
      get_lesson: () => ({
        data: payload({ attempts: [attempt(EX1), attempt(EX2, { verdict: 'incorrect', is_correct: false, score: 0, final: false })] }),
      }),
      submit_exercise: () => ({ data: result() }),
      complete_lesson: () => ({ data: null }),
    });
    const { result: hook } = renderRun();
    await ready(hook);
    expect(hook.current.api.unresolved).toEqual([5]);
    expect(hook.current.api.pendingCount).toBe(0);
    expect(hook.current.api.canComplete).toBe(false);
    expect(await act(() => hook.current.api.complete())).toBeNull();
    expect(fake.callsOf('complete_lesson')).toEqual([]);

    await act(() => hook.current.api.submit(EX2, 1, { option_id: 'a' }, { confidence: 2, responseMs: 10, hintCount: 0 }));
    expect(hook.current.api.unresolved).toEqual([]);
    expect(hook.current.api.canComplete).toBe(true);
  });

  it('adds a re-check step when the result is requeued', async () => {
    installClient({
      get_lesson: () => ({ data: payload() }),
      submit_exercise: () => ({ data: result({ verdict: 'incorrect', is_correct: false, revealed: true, requeued: true }) }),
    });
    const { result: hook } = renderRun();
    await ready(hook);
    await act(() => hook.current.api.submit(EX1, 0, { give_up: true }, { confidence: null, responseMs: 10, hintCount: 0 }));
    expect(hook.current.api.steps).toHaveLength(9);
    expect(hook.current.api.steps[6]).toEqual({ kind: 'exercise', exerciseId: EX1, stage: 'recognition', recheck: true, queueIndex: 2 });
  });

  it('shows a toast and returns to idle on a server error', async () => {
    installClient({
      get_lesson: () => ({ data: payload() }),
      submit_exercise: () => ({ error: { message: 'rate_limited', code: 'P0001' } }),
    });
    const { result: hook } = renderRun();
    await ready(hook);
    await act(() => hook.current.api.submit(EX1, 0, { option_id: 'a' }, { confidence: null, responseMs: 10, hintCount: 0 }));
    expect(hook.current.api.exerciseState(EX1, 0).status).toBe('idle');
    expect(await screen.findByText('Bạn đang gửi quá nhanh. Đợi một chút rồi thử lại.')).toBeInTheDocument();
  });

  it('keeps an offline answer pending, blocks completion, then merges the flushed result', async () => {
    const graded = result();
    let offline = true;
    const fake = installClient({
      get_lesson: () => ({ data: payload() }),
      submit_exercise: () => (offline ? { error: NETWORK } : { data: graded }),
      complete_lesson: () => ({ data: null }),
    });
    const { result: hook } = renderRun();
    await ready(hook);
    await act(() => hook.current.api.submit(EX1, 0, { option_id: 'a' }, { confidence: null, responseMs: 10, hintCount: 0 }));
    expect(hook.current.api.exerciseState(EX1, 0)).toEqual({ status: 'pending_sync', attempts: 0, lastResult: null });
    expect(hook.current.api.pendingCount).toBe(1);
    expect(hook.current.api.canComplete).toBe(false);
    expect(await act(() => hook.current.api.complete())).toBeNull();
    expect(fake.callsOf('complete_lesson')).toEqual([]);
    const [queued] = createOutbox(USER_ID).list();
    expect(queued).toMatchObject({ queueIndex: 0, args: { p_exercise_id: EX1 } });

    offline = false;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(hook.current.api.exerciseState(EX1, 0).status).toBe('graded'));
    expect(fake.callsOf('submit_exercise').map((a) => a.p_idempotency_key)).toEqual([
      queued!.args.p_idempotency_key,
      queued!.args.p_idempotency_key,
    ]);
    expect(hook.current.api.pendingCount).toBe(0);
    // Synced, but EX2 is still unanswered.
    expect(hook.current.api.unresolved).toEqual([5]);
    expect(hook.current.api.canComplete).toBe(false);
  });

  it.each([
    ['times out', { message: 'AbortError: signal timed out', code: '', status: 0 }],
    ['fails on the server before grading', { message: 'upstream error', code: '', status: 503 }],
  ])('queues the answer under the same idempotency key when the submit %s', async (_case, failure) => {
    let down = true;
    const fake = installClient({
      get_lesson: () => ({ data: payload() }),
      submit_exercise: () => (down ? { error: { message: failure.message, code: failure.code }, status: failure.status } : { data: result() }),
    });
    const { result: hook } = renderRun();
    await ready(hook);
    await act(() => hook.current.api.submit(EX1, 0, { option_id: 'a' }, { confidence: null, responseMs: 10, hintCount: 0 }));
    expect(hook.current.api.exerciseState(EX1, 0).status).toBe('pending_sync');
    const [sent] = fake.callsOf('submit_exercise');
    const [queued] = createOutbox(USER_ID).list();
    expect(queued!.args.p_idempotency_key).toBe(sent!.p_idempotency_key);

    down = false;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(hook.current.api.exerciseState(EX1, 0).status).toBe('graded'));
    expect(new Set(fake.callsOf('submit_exercise').map((a) => a.p_idempotency_key))).toEqual(new Set([sent!.p_idempotency_key]));
  });

  it('queues straight to the outbox when the browser is offline', async () => {
    const fake = installClient({ get_lesson: () => ({ data: payload() }), submit_exercise: () => ({ error: NETWORK }) });
    const { result: hook } = renderRun();
    await ready(hook);
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await act(() => hook.current.api.submit(EX1, 0, { option_id: 'a' }, { confidence: null, responseMs: 10, hintCount: 0 }));
    expect(fake.callsOf('submit_exercise')).toEqual([]);
    expect(hook.current.api.exerciseState(EX1, 0).status).toBe('pending_sync');
  });

  it('ignores a second submit of the same entry while the first is in flight, and any submit once resolved', async () => {
    let resolveFirst: (value: { data: unknown }) => void = () => undefined;
    const rpc = vi.fn((name: string) => {
      if (name === 'get_lesson') return Promise.resolve({ data: payload(), error: null });
      return new Promise<{ data: unknown }>((resolve) => {
        resolveFirst = resolve;
      }).then((r) => ({ ...r, error: null }));
    });
    mocks.client = { rpc };
    const { result: hook } = renderRun();
    await ready(hook);
    const meta = { confidence: null, responseMs: 10, hintCount: 0 };
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      // Same tick (double click): React has not re-rendered between the two calls.
      first = hook.current.api.submit(EX1, 0, { option_id: 'a' }, meta);
      second = hook.current.api.submit(EX1, 0, { option_id: 'b' }, meta);
    });
    await act(async () => {
      resolveFirst({ data: result() });
      await Promise.all([first, second]);
    });
    const submits = () => rpc.mock.calls.filter(([n]) => n === 'submit_exercise');
    expect(submits()).toHaveLength(1);
    expect(hook.current.api.exerciseState(EX1, 0).lastResult?.final).toBe(true);
    // Resolved: a later submit would be stored as an after-reveal attempt (a fake re-check).
    await act(() => hook.current.api.submit(EX1, 0, { option_id: 'b' }, meta));
    expect(submits()).toHaveLength(1);
  });

  it('does not leave an answer pending forever when the outbox cannot be written', async () => {
    installClient({ get_lesson: () => ({ data: payload() }), submit_exercise: () => ({ error: NETWORK }) });
    const { result: hook } = renderRun();
    await ready(hook);
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      await act(() => hook.current.api.submit(EX1, 0, { option_id: 'a' }, { confidence: null, responseMs: 10, hintCount: 0 }));
    } finally {
      setItem.mockRestore();
    }
    expect(hook.current.api.exerciseState(EX1, 0).status).toBe('idle');
    expect(hook.current.api.pendingCount).toBe(0);
    expect(createOutbox(USER_ID).list()).toEqual([]);
    expect(await screen.findByText(/^Không lưu được câu trả lời trên thiết bị/)).toBeInTheDocument();
  });

  it('reports a storage failure (not a pending answer) when offline and the outbox is full', async () => {
    const fake = installClient({ get_lesson: () => ({ data: payload() }) });
    const { result: hook } = renderRun();
    await ready(hook);
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      await act(() => hook.current.api.submit(EX1, 0, { option_id: 'a' }, { confidence: null, responseMs: 10, hintCount: 0 }));
    } finally {
      setItem.mockRestore();
    }
    expect(fake.callsOf('submit_exercise')).toEqual([]);
    expect(hook.current.api.exerciseState(EX1, 0).status).toBe('idle');
    expect(await screen.findByText(/^Không lưu được câu trả lời trên thiết bị/)).toBeInTheDocument();
  });

  it('restores pending entries of this run after a reload', async () => {
    installClient({ get_lesson: () => ({ data: payload() }), submit_exercise: () => ({ error: NETWORK }) });
    createOutbox(USER_ID).add({
      args: {
        p_run_id: RUN_ID,
        p_exercise_id: EX2,
        p_exercise_version: 1,
        p_idempotency_key: 'b0000000-0000-4000-8000-000000000001',
        p_response: { option_id: 'a' },
        p_confidence: 2,
        p_response_ms: 10,
        p_hint_count: 0,
        p_client_at: '2026-10-13T08:00:00.000Z',
      },
      queueIndex: 1,
    });
    const { result: hook } = renderRun();
    await ready(hook);
    expect(hook.current.api.exerciseState(EX2, 1).status).toBe('pending_sync');
  });

  it('completes the lesson', async () => {
    const done = {
      accuracy_by_stage: { recognition: 1, recall: 1, application: null },
      almost_count: 0,
      confident_wrong: 0,
      unsure_right: 0,
      next_review_at: '2026-10-14T00:00:00+07:00',
      completed_at: '2026-10-13T08:00:00Z',
    };
    const fake = installClient({ get_lesson: () => ({ data: payload({ attempts: [attempt(EX1), attempt(EX2)] }) }), complete_lesson: () => ({ data: done }) });
    const { result: hook } = renderRun();
    await ready(hook);
    let returned: unknown;
    await act(async () => {
      returned = await hook.current.api.complete();
    });
    expect(returned).toEqual(done);
    expect(fake.callsOf('complete_lesson')).toEqual([{ p_run_id: RUN_ID }]);
    expect(hook.current.api.completeResult).toEqual(done);
    // A second call does not hit the server again.
    await act(() => hook.current.api.complete());
    expect(fake.callsOf('complete_lesson')).toHaveLength(1);
  });

  it('reports load errors in Vietnamese and retries', async () => {
    let fail = true;
    const fake = installClient({
      get_lesson: () => (fail ? { error: { message: 'lesson_not_in_path', code: 'P0001' } } : { data: payload() }),
    });
    const { result: hook } = renderRun();
    await waitFor(() => expect(hook.current.api.status).toBe('error'));
    expect(hook.current.api.error).toBe('Bài học này không thuộc lộ trình hiện tại.');
    fail = false;
    act(() => hook.current.api.retry());
    await ready(hook);
    expect(fake.callsOf('get_lesson')).toHaveLength(2);
  });

  it('errors when there is no current path', async () => {
    installClient({});
    const { result: hook } = renderRun(undefined, null);
    await waitFor(() => expect(hook.current.api.status).toBe('error'));
    expect(hook.current.api.error).toBe('Không tìm thấy lộ trình.');
  });

  it('reopens the cached lesson offline', async () => {
    let offline = false;
    installClient({ get_lesson: () => (offline ? { error: NETWORK } : { data: payload({ run: run({ cursor: 4 }) }) }) });
    const first = renderRun();
    await ready(first.result);
    expect(sessionStorage.getItem(lessonCacheKey(USER_ID, PATH_ID, LESSON_ID))).not.toBeNull();
    first.unmount();

    offline = true;
    const { result: hook } = renderRun();
    await ready(hook);
    expect(hook.current.api.stepIndex).toBe(4);
  });

  it('scopes the offline cache to the path and never reopens a completed run from it', async () => {
    const OTHER_PATH = '30000000-0000-4000-8000-000000000002';
    let offline = false;
    installClient({ get_lesson: () => (offline ? { error: NETWORK } : { data: payload({ run: run({ cursor: 4 }) }) }) });
    const first = renderRun();
    await ready(first.result);
    first.unmount();

    offline = true;
    const other = renderRun(undefined, OTHER_PATH);
    await waitFor(() => expect(other.result.current.api.status).toBe('error'));
    other.unmount();

    sessionStorage.setItem(lessonCacheKey(USER_ID, PATH_ID, LESSON_ID), JSON.stringify(payload({ run: run({ status: 'completed' }) })));
    const { result: hook } = renderRun();
    await waitFor(() => expect(hook.current.api.status).toBe('error'));
  });

  it('fails offline without a cached lesson', async () => {
    installClient({ get_lesson: () => ({ error: NETWORK }) });
    const { result: hook } = renderRun();
    await waitFor(() => expect(hook.current.api.status).toBe('error'));
    expect(hook.current.api.error).toMatch(/^Không kết nối được máy chủ/);
  });
});
