import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import { SESSION_PATH_ID, inputs, plan, sessionWithStatuses, studySession, todayResult } from './session-fixtures';
import { usePlanner } from './usePlanner';
import { useTodaySession } from './useTodaySession';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PATH = '30000000-0000-4000-8000-000000000002';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } as { rpc: typeof rpc } | null };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

// planSession / shortenPlan are owned by another task; these tests inject them or check the default is used.
const planner = vi.hoisted(() => ({ planSession: vi.fn(), shortenPlan: vi.fn() }));
vi.mock('@linguo/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@linguo/shared')>()),
  planSession: planner.planSession,
  shortenPlan: planner.shortenPlan,
}));

function wrapper(pathId: string | null = SESSION_PATH_ID) {
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
      <AuthContext.Provider value={auth}>
        <LearningPathsContext.Provider value={paths}>{children}</LearningPathsContext.Provider>
      </AuthContext.Provider>
    );
  };
}

function reply(fn: (name: string, args: Record<string, unknown>) => { data?: unknown; error?: unknown }) {
  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    const { data = null, error = null } = fn(name, args);
    return Promise.resolve({ data, error });
  });
}

afterEach(() => {
  mocks.rpc.mockReset();
  mocks.client = { rpc: mocks.rpc };
  planner.planSession.mockReset();
  planner.shortenPlan.mockReset();
});

describe('useTodaySession', () => {
  it("loads today's session of the current path", async () => {
    reply(() => ({ data: todayResult(studySession(), { studied_seconds_today: 600, daily_goal_minutes: 45 }) }));
    const { result } = renderHook(() => useTodaySession(), { wrapper: wrapper() });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.session).toEqual(studySession());
    expect(result.current.studiedSecondsToday).toBe(600);
    expect(result.current.dailyGoalMinutes).toBe(45);
    expect(mocks.rpc.mock.calls).toEqual([['get_today_session', { p_path_id: SESSION_PATH_ID }]]);
  });

  it('accepts an explicit path', async () => {
    reply(() => ({ data: todayResult(null) }));
    const { result } = renderHook(() => useTodaySession(OTHER_PATH), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.session).toBeNull();
    expect(mocks.rpc.mock.calls).toEqual([['get_today_session', { p_path_id: OTHER_PATH }]]);
  });

  it('maps errors and reloads', async () => {
    let fail = true;
    reply(() => (fail ? { error: { message: 'path_not_active', code: 'P0001' } } : { data: todayResult() }));
    const { result } = renderHook(() => useTodaySession(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Lộ trình này đang tạm dừng. Hãy bật lại lộ trình để học.');
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('errors without a path or a client', async () => {
    reply(() => ({ data: todayResult() }));
    const { result } = renderHook(() => useTodaySession(), { wrapper: wrapper(null) });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.client = null;
    const offline = renderHook(() => useTodaySession(), { wrapper: wrapper() });
    await waitFor(() => expect(offline.result.current.error).toBe('Chưa cấu hình kết nối máy chủ.'));
  });

  it('puts a mutated session on screen without refetching', async () => {
    reply(() => ({ data: todayResult() }));
    const { result } = renderHook(() => useTodaySession(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const next = sessionWithStatuses(['done', 'pending', 'pending', 'pending']);
    act(() => result.current.setSession(next));
    expect(result.current.session).toEqual(next);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});

describe('usePlanner', () => {
  it('fetches inputs, plans and saves', async () => {
    reply((name) => (name === 'get_session_inputs' ? { data: inputs() } : { data: studySession() }));
    const plan15 = plan({ minutes: 15 });
    const planFn = vi.fn(() => plan15);
    const { result } = renderHook(() => usePlanner({ plan: planFn }));
    let saved;
    await act(async () => {
      saved = await result.current.create(SESSION_PATH_ID, 15);
    });
    expect(saved).toEqual(studySession());
    expect(planFn).toHaveBeenCalledWith(inputs(), 15);
    expect(mocks.rpc.mock.calls).toEqual([
      ['get_session_inputs', { p_path_id: SESSION_PATH_ID }],
      ['save_session_plan', { p_path_id: SESSION_PATH_ID, p_plan: plan15, p_replace: false }],
    ]);
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('uses the shared planner by default and can replace', async () => {
    reply((name) => (name === 'get_session_inputs' ? { data: inputs() } : { data: studySession() }));
    planner.planSession.mockReturnValue(plan());
    const { result } = renderHook(() => usePlanner());
    await act(async () => {
      await result.current.create(SESSION_PATH_ID, 30, true);
    });
    expect(planner.planSession).toHaveBeenCalledWith(inputs(), 30);
    expect(mocks.rpc.mock.calls[1]).toEqual(['save_session_plan', { p_path_id: SESSION_PATH_ID, p_plan: plan(), p_replace: true }]);
  });

  it('reports a planner failure without saving', async () => {
    reply(() => ({ data: inputs() }));
    const { result } = renderHook(() =>
      usePlanner({
        plan: () => {
          throw new Error('boom');
        },
      }),
    );
    let saved;
    await act(async () => {
      saved = await result.current.create(SESSION_PATH_ID, 30);
    });
    expect(saved).toBeNull();
    expect(result.current.error).toMatch(/^Chưa lập được kế hoạch/);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['get_session_inputs']);
  });

  it('maps RPC errors', async () => {
    reply(() => ({ error: { message: 'path_not_found', code: 'P0001' } }));
    const { result } = renderHook(() => usePlanner({ plan: () => plan() }));
    await act(async () => {
      await result.current.create(SESSION_PATH_ID, 30);
    });
    expect(result.current.error).toBe('Không tìm thấy lộ trình.');
  });

  it("shortens the session's plan and saves it over the open session", async () => {
    const short = plan({ minutes: 10 });
    reply(() => ({ data: studySession({ minutes_planned: 10, plan: short }) }));
    const shortenFn = vi.fn(() => short);
    const { result } = renderHook(() => usePlanner({ shorten: shortenFn }));
    await act(async () => {
      await result.current.shorten(SESSION_PATH_ID, studySession(), 10);
    });
    expect(shortenFn).toHaveBeenCalledWith(plan(), 10);
    expect(mocks.rpc.mock.calls).toEqual([['save_session_plan', { p_path_id: SESSION_PATH_ID, p_plan: short, p_replace: true }]]);
  });
});
