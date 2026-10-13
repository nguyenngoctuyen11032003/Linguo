import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lessonPayloadJson, runJson } from '../../../tests/unit/lesson-fixtures';
import { AuthContext } from '../auth/AuthProvider';
import { lessonErrorCode } from './error-map';
import { lessonCacheKey } from './lesson-cache';
import { outboxKey, outboxSize } from './outbox';
import { usePathLessons } from './usePathLessons';
import { useLessonRun, type LessonRun } from './useLessonRun';

type Reply = { data?: unknown; error?: unknown };
type Handler = (args: Record<string, unknown>) => Reply | Promise<Reply>;

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));

const OFFLINE: Reply = { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } };

function scriptedClient(handlers: Record<string, Handler>) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const client = {
    calls,
    handlers,
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      const handler = handlers[name];
      if (!handler) return Promise.reject(new Error(`No handler for ${name}`));
      return Promise.resolve(handler(args)).then((r) => ({ data: r.data ?? null, error: r.error ?? null }));
    },
  };
  mocks.client = client;
  return client;
}

const graded = (o: Record<string, unknown> = {}) => ({
  data: {
    attempt_id: crypto.randomUUID(),
    attempt_no: 1,
    verdict: 'correct',
    is_correct: true,
    score: 1,
    error_tags: [],
    feedback_vi: null,
    revealed: false,
    display_answer: 'Hello',
    explanation: { vi: 'Vì…' },
    requeued: false,
    replayed: false,
    ...o,
  },
});

const COMPLETE = { data: { run_id: 'run-1', next_review_at: '2026-10-14T00:00:00+07:00', summary: { accuracy_by_stage: {}, almost_count: 0, confident_wrong: 0, unsure_right: 0 } } };

const user = { id: 'u1' } as User;
const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthContext.Provider value={{ status: 'signed-in', session: null, user }}>{children}</AuthContext.Provider>
);

const META = { confidence: null, responseMs: 900, hintCount: 0 } as const;

function baseHandlers(overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    get_lesson: () => ({ data: lessonPayloadJson() }),
    start_lesson: () => ({ data: runJson() }),
    save_lesson_cursor: () => ({ data: null }),
    submit_exercise: () => graded(),
    complete_lesson: () => COMPLETE,
    ...overrides,
  };
}

async function renderRun() {
  const hook = renderHook(() => useLessonRun('lesson-1', 'path-1'), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return hook;
}

async function toFirstExercise(result: { current: LessonRun }) {
  for (let i = 0; i < 4; i++) act(() => result.current.next());
  expect(result.current.view?.kind).toBe('exercise');
}

beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', undefined);
  const fake = Object.create(navigator) as Navigator;
  Object.defineProperty(fake, 'locks', { value: undefined, configurable: true });
  Object.defineProperty(fake, 'onLine', { value: true, configurable: true });
  vi.stubGlobal('navigator', fake);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useLessonRun', () => {
  it('starts a run when the lesson has none and caches the lesson text', async () => {
    const client = scriptedClient(baseHandlers());
    const { result } = await renderRun();
    expect(client.calls.map(([n]) => n)).toEqual(['get_lesson', 'start_lesson']);
    expect(result.current.view).toMatchObject({ kind: 'content', step: 'objective' });
    expect(result.current.offline).toBe(false);
    expect(JSON.parse(localStorage.getItem(lessonCacheKey('u1')) ?? '{}')).toMatchObject({ lessonId: 'lesson-1', pathId: 'path-1' });
  });

  it('resumes an in-progress run from get_lesson without starting another', async () => {
    const client = scriptedClient(baseHandlers({ get_lesson: () => ({ data: lessonPayloadJson({ run: runJson({ cursor: 6 }) }) }) }));
    const { result } = await renderRun();
    expect(client.calls.map(([n]) => n)).not.toContain('start_lesson');
    expect(result.current.view).toMatchObject({ kind: 'exercise', exercise: expect.objectContaining({ id: 'e3' }) });
  });

  it('submits online, shows the confirmed verdict and saves the cursor', async () => {
    const client = scriptedClient(baseHandlers());
    const { result } = await renderRun();
    await toFirstExercise(result);
    await act(() => result.current.submit({ option_id: 'a' }, META));
    expect(result.current.view?.feedback).toMatchObject({ verdict: 'correct' });
    const submit = client.calls.find(([n]) => n === 'submit_exercise')?.[1];
    expect(submit).toMatchObject({ p_run_id: 'run-1', p_exercise_id: 'e1', p_exercise_version: 1, p_response: { option_id: 'a' }, p_response_ms: 900 });
    await waitFor(() => expect(client.calls.filter(([n]) => n === 'save_lesson_cursor').at(-1)?.[1]).toEqual({ p_run_id: 'run-1', p_cursor: 4 }));
  });

  it('sends only one request on a double tap', async () => {
    const client = scriptedClient(baseHandlers());
    const { result } = await renderRun();
    await toFirstExercise(result);
    await act(() => Promise.all([result.current.submit({ option_id: 'a' }, META), result.current.submit({ option_id: 'a' }, META)]));
    expect(client.calls.filter(([n]) => n === 'submit_exercise')).toHaveLength(1);
  });

  it('queues a submission on network failure, then applies the verdict once it syncs with the same key', async () => {
    const client = scriptedClient(baseHandlers({ submit_exercise: () => OFFLINE }));
    const { result } = await renderRun();
    await toFirstExercise(result);
    await act(() => result.current.submit({ option_id: 'a' }, META));
    expect(result.current.view).toMatchObject({ pendingSync: true, feedback: null, canAdvance: true });
    expect(outboxSize('u1')).toBe(1);
    expect(result.current.state?.outboxSize).toBe(1);
    expect(result.current.view?.canComplete).toBe(false);

    client.handlers.submit_exercise = () => graded();
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current.view?.feedback).toMatchObject({ verdict: 'correct' }));
    expect(outboxSize('u1')).toBe(0);
    expect(result.current.state?.outboxSize).toBe(0);
    const keys = client.calls.filter(([n]) => n === 'submit_exercise').map(([, a]) => a.p_idempotency_key);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(new Set(keys).size).toBe(1);
  });

  it('reopens the cached lesson offline at the last known step', async () => {
    scriptedClient(baseHandlers());
    const first = await renderRun();
    await toFirstExercise(first.result);
    await act(() => first.result.current.submit({ option_id: 'a' }, META));
    act(() => first.result.current.next());
    first.unmount();

    scriptedClient(baseHandlers({ get_lesson: () => OFFLINE, save_lesson_cursor: () => OFFLINE }));
    const { result } = await renderRun();
    expect(result.current.offline).toBe(true);
    expect(result.current.view).toMatchObject({ kind: 'exercise', exercise: expect.objectContaining({ id: 'e2' }) });
    expect(result.current.state?.exercises.e1?.final).toBe(true);
  });

  it('reports a lesson that is not available offline', async () => {
    scriptedClient(baseHandlers({ get_lesson: () => OFFLINE }));
    const { result } = renderHook(() => useLessonRun('lesson-1', 'path-1'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(lessonErrorCode(result.current.error)).toBe('lesson_unavailable_offline');
  });

  it('surfaces server errors without falling back to the cache', async () => {
    scriptedClient(baseHandlers({ get_lesson: () => ({ error: { code: 'P0001', message: 'lesson_not_in_path' } }) }));
    const { result } = renderHook(() => useLessonRun('lesson-1', 'path-1'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(lessonErrorCode(result.current.error)).toBe('lesson_not_in_path');
  });

  it('merges pending outbox items into a resumed run', async () => {
    localStorage.setItem(
      outboxKey('u1'),
      JSON.stringify([
        {
          idempotencyKey: crypto.randomUUID(),
          runId: 'run-1',
          lessonId: 'lesson-1',
          exerciseId: 'e1',
          exerciseVersion: 1,
          response: { option_id: 'a' },
          confidence: null,
          responseMs: 1,
          hintCount: 0,
          clientAt: new Date().toISOString(),
          enqueuedAt: Date.now(),
        },
      ]),
    );
    scriptedClient(baseHandlers({ get_lesson: () => ({ data: lessonPayloadJson({ run: runJson({ cursor: 4 }) }) }), submit_exercise: () => OFFLINE }));
    const { result } = await renderRun();
    expect(result.current.view).toMatchObject({ pendingSync: true, feedback: null, canAdvance: true });
  });

  it('completes only when everything is answered and synced', async () => {
    const client = scriptedClient(baseHandlers());
    const { result } = await renderRun();
    await toFirstExercise(result);
    for (let i = 0; i < 4; i++) {
      await act(() => result.current.submit({ option_id: 'a' }, META));
      act(() => result.current.next());
    }
    expect(result.current.view).toMatchObject({ kind: 'summary', canComplete: true });
    await act(() => result.current.complete());
    expect(client.calls.filter(([n]) => n === 'complete_lesson')).toEqual([['complete_lesson', { p_run_id: 'run-1' }]]);
    expect(result.current.view?.kind).toBe('next_review');
    expect(result.current.state?.completion.result?.nextReviewAt).toBe('2026-10-14T00:00:00+07:00');
  });
});

describe('usePathLessons', () => {
  const row = {
    lesson_id: 'lesson-1',
    unit: { id: 'u1', title: { vi: 'Chào hỏi' } },
    program: { id: 'p1', title: { vi: 'Nền tảng' } },
    title: { vi: 'Xin chào!' },
    level_code: 'pre_a1',
    estimated_minutes: 10,
    is_demo: true,
    prerequisites_met: true,
    run_status: 'not_started',
  };

  it('is idle without a path and loads the lessons of a path', async () => {
    scriptedClient({ path_lessons: () => ({ data: [row] }) });
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => usePathLessons(id), { initialProps: { id: null as string | null } });
    expect(result.current.status).toBe('idle');
    rerender({ id: 'path-1' });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.lessons.map((l) => l.lessonId)).toEqual(['lesson-1']);
  });

  it('reports errors and reloads', async () => {
    const client = scriptedClient({ path_lessons: () => ({ error: { code: 'P0001', message: 'path_not_found' } }) });
    const { result } = renderHook(() => usePathLessons('path-1'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    client.handlers.path_lessons = () => ({ data: [row] });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.lessons).toHaveLength(1);
  });
});
