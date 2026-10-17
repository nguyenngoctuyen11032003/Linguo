import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import { getContentStore, releaseContentStore } from '@/features/offline/content-store';
import { dropMemoryDb } from '@/features/offline/idb';
import { EX1, EX2, LESSON_ID, PATH_ID, attempt, offlinePack, payload, run } from './lesson-fixtures';
import { openLessonOps } from './offline-queue';
import { OutboxSyncProvider } from './OutboxSyncProvider';
import { createOutbox } from './outbox';
import { useLessonRun } from './useLessonRun';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NETWORK = { message: 'TypeError: Failed to fetch', code: '' };

const mocks = vi.hoisted(() => ({ client: null as unknown, track: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));
vi.mock('@/features/analytics', () => ({ track: mocks.track }));

type Handler = (args: Record<string, unknown>) => { data?: unknown; error?: unknown; status?: number };
function installClient(handlers: Record<string, Handler>) {
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    const handler = handlers[name];
    if (!handler) return Promise.resolve({ data: null, error: NETWORK });
    const { data = null, error = null, status } = handler(args);
    return Promise.resolve({ data, error, ...(status === undefined ? {} : { status }) });
  });
  mocks.client = { rpc };
  return { rpc, callsOf: (name: string) => rpc.mock.calls.filter(([n]) => n === name).map(([, a]) => a) };
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

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
      <MemoryRouter initialEntries={[`/app/hoc-tap/bai/${LESSON_ID}`]}>
        <ToastProvider>
          <AuthContext.Provider value={auth}>
            <OutboxSyncProvider>
              <LearningPathsContext.Provider value={paths}>{children}</LearningPathsContext.Provider>
            </OutboxSyncProvider>
          </AuthContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );
  };
}

const renderRun = () => renderHook(() => ({ api: useLessonRun(LESSON_ID), location: useLocation() }), { wrapper: wrapper() });
type Hook = ReturnType<typeof renderRun>['result'];
const ready = (hook: Hook) => waitFor(() => expect(hook.current.api.status).toBe('ready'));

async function storePack() {
  const s = await getContentStore(USER_ID);
  await s.savePacks([offlinePack()], { pathId: PATH_ID, hashes: new Map() });
  return s;
}

const stepOf = (hook: Hook, exerciseId: string) => {
  const step = hook.current.api.steps.find((s) => s.kind === 'exercise' && s.exerciseId === exerciseId);
  if (!step || step.kind !== 'exercise') throw new Error('step missing');
  return step;
};
const meta = { confidence: null, responseMs: 900, hintCount: 0 } as const;

beforeEach(() => setOnline(true));
afterEach(async () => {
  mocks.track.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  await releaseContentStore(USER_ID);
  dropMemoryDb(USER_ID);
  setOnline(true);
});

describe('useLessonRun from the device copy', () => {
  it('starts a run offline from the stored pack, grades at once, queues start + answers, completes locally', async () => {
    await storePack();
    setOnline(false);
    const fake = installClient({});
    const { result: hook } = renderRun();
    await ready(hook);
    expect(hook.current.api.localMode).toBe(true);
    expect(fake.callsOf('get_lesson')).toEqual([]);
    const runId = hook.current.api.runId!;
    // The start waits in the lesson ops outbox with the device's run id.
    const ops = openLessonOps(USER_ID).list();
    expect(ops).toHaveLength(1);
    expect(ops[0]!.args).toMatchObject({ op: 'start', p_run_id: runId, p_lesson_id: LESSON_ID, p_path_id: PATH_ID });
    expect(hook.current.api.exercises[EX1]).toBeDefined();

    // Wrong answer first: no reveal; then the right one.
    const s1 = stepOf(hook, EX1);
    await act(() => hook.current.api.submit(EX1, s1.queueIndex, { option_id: 'b' }, meta));
    expect(hook.current.api.exerciseState(EX1, s1.queueIndex)).toMatchObject({ status: 'graded', lastResult: { verdict: 'incorrect', revealed: false, display_answer: null } });
    await act(() => hook.current.api.submit(EX1, s1.queueIndex, { option_id: 'a' }, meta));
    expect(hook.current.api.exerciseState(EX1, s1.queueIndex).lastResult).toMatchObject({ verdict: 'correct', attempt_no: 2, display_answer: 'Hello' });
    const s2 = stepOf(hook, EX2);
    await act(() => hook.current.api.submit(EX2, s2.queueIndex, { option_id: 'a' }, meta));
    expect(fake.callsOf('submit_exercise')).toEqual([]);
    const queued = createOutbox(USER_ID).list();
    expect(queued).toHaveLength(3);
    expect(queued.every((e) => e.args.p_run_id === runId)).toBe(true);

    // Completion works with answers still queued (it waits behind them in the outbox).
    expect(hook.current.api.canComplete).toBe(true);
    let summary: Awaited<ReturnType<typeof hook.current.api.complete>> = null;
    await act(async () => {
      summary = await hook.current.api.complete();
    });
    expect(summary).toMatchObject({ accuracy_by_stage: { recognition: 0, recall: 1, application: null } });
    expect(hook.current.api.completeResult).not.toBeNull();
    expect(openLessonOps(USER_ID).list().map((e) => e.args.op)).toEqual(['start', 'complete']);
    expect(fake.callsOf('complete_lesson')).toEqual([]);
    // The device remembers the finished run (lesson list overlay) until the server confirms.
    const stored = await (await getContentStore(USER_ID)).findRun(LESSON_ID, PATH_ID);
    expect(stored?.run.status).toBe('completed');
  });

  it('reopens the run the device still owns instead of starting another one', async () => {
    await storePack();
    setOnline(false);
    installClient({});
    const first = renderRun();
    await ready(first.result);
    const runId = first.result.current.api.runId!;
    const s1 = stepOf(first.result, EX1);
    await act(() => first.result.current.api.submit(EX1, s1.queueIndex, { option_id: 'a' }, meta));
    first.unmount();

    const second = renderRun();
    await ready(second.result);
    expect(second.result.current.api.runId).toBe(runId);
    expect(second.result.current.api.localMode).toBe(true);
    expect(second.result.current.api.exerciseState(EX1, 0).lastResult?.verdict).toBe('correct');
    expect(openLessonOps(USER_ID).list().filter((e) => e.args.op === 'start')).toHaveLength(1);
  });

  it('needs the network for a lesson that was never downloaded', async () => {
    setOnline(false);
    installClient({});
    const { result: hook } = renderRun();
    await waitFor(() => expect(hook.current.api.status).toBe('error'));
    expect(hook.current.api.error).toMatch(/chưa được tải về máy/);
  });

  it('falls back to the stored pack when the server cannot be reached while "online"', async () => {
    await storePack();
    const fake = installClient({});
    const { result: hook } = renderRun();
    await ready(hook);
    expect(fake.callsOf('get_lesson')).toHaveLength(1);
    expect(hook.current.api.localMode).toBe(true);
  });

  it('carries on from the stored pack when the network drops in the middle of a server run', async () => {
    await storePack();
    const fake = installClient({ get_lesson: () => ({ data: payload({ run: run({ id: '40000000-0000-4000-8000-0000000000aa' }) }) }), submit_exercise: () => ({ error: NETWORK }) });
    const { result: hook } = renderRun();
    await ready(hook);
    expect(hook.current.api.localMode).toBe(false);
    setOnline(false);
    const s1 = stepOf(hook, EX1);
    await act(() => hook.current.api.submit(EX1, s1.queueIndex, { option_id: 'a' }, meta));
    expect(hook.current.api.localMode).toBe(true);
    expect(hook.current.api.exerciseState(EX1, s1.queueIndex)).toMatchObject({ status: 'graded', lastResult: { verdict: 'correct' } });
    expect(fake.callsOf('submit_exercise')).toEqual([]);
    expect(createOutbox(USER_ID).list()).toHaveLength(1);
    expect(createOutbox(USER_ID).list()[0]!.args.p_run_id).toBe('40000000-0000-4000-8000-0000000000aa');
  });

  it('without a stored pack, an offline answer still waits without a verdict (previous behaviour)', async () => {
    installClient({ get_lesson: () => ({ data: payload() }) });
    const { result: hook } = renderRun();
    await ready(hook);
    setOnline(false);
    const s1 = stepOf(hook, EX1);
    await act(() => hook.current.api.submit(EX1, s1.queueIndex, { option_id: 'a' }, meta));
    expect(hook.current.api.exerciseState(EX1, s1.queueIndex).status).toBe('pending_sync');
    expect(hook.current.api.localMode).toBe(false);
  });

  it('canComplete counts only this run\'s queued entries, not the whole outbox', async () => {
    installClient({ get_lesson: () => ({ data: payload({ attempts: [attempt(EX1), attempt(EX2)], run: run() }) }) });
    // An answer of some other run waits in the outbox.
    createOutbox(USER_ID).add({
      queueIndex: 0,
      args: {
        p_run_id: '40000000-0000-4000-8000-0000000000bb',
        p_exercise_id: EX1,
        p_exercise_version: 1,
        p_idempotency_key: 'a0000000-0000-4000-8000-0000000000cc',
        p_response: { option_id: 'a' },
        p_confidence: null,
        p_response_ms: 1,
        p_hint_count: 0,
        p_client_at: '2026-10-13T08:00:00.000Z',
      },
    });
    const { result: hook } = renderRun();
    await ready(hook);
    expect(hook.current.api.pendingCount).toBe(1);
    // Every exercise of this run is answered: the other run's queued entry must not hold the completion back.
    expect(hook.current.api.canComplete).toBe(true);
  });
});
