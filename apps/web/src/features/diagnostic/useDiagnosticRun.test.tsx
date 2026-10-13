import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import { ATTEMPT_ID, PATH_ID, diagItem, diagItemId, placement, report, status, step } from './diagnostic-fixtures';
import { useDiagnosticRun } from './useDiagnosticRun';
import { useDiagnosticStatus } from './useDiagnosticStatus';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

const reloadPaths = vi.fn();

function wrapper({ children }: { children: ReactNode }) {
  const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };
  const paths: LearningPathsContextValue = {
    status: 'ready',
    error: null,
    paths: [],
    currentId: PATH_ID,
    current: null,
    reload: reloadPaths,
    setCurrent: vi.fn(),
    upsertPath: vi.fn(),
  };
  return (
    <AuthContext.Provider value={auth}>
      <LearningPathsContext.Provider value={paths}>{children}</LearningPathsContext.Provider>
    </AuthContext.Provider>
  );
}

type Reply = { data?: unknown; error?: unknown };
type Handler = Reply | ((args: Record<string, unknown>) => Reply);

/** Each RPC name maps to a reply, a function of the args, or a queue of those (the last one repeats). */
function server(handlers: Record<string, Handler | Handler[]>) {
  const queues = new Map(Object.entries(handlers).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    const queue = queues.get(name);
    if (!queue) return Promise.resolve({ data: null, error: { message: `no_fake_${name}`, code: 'X' } });
    const handler = (queue.length > 1 ? queue.shift() : queue[0]) as Handler;
    const { data = null, error = null } = typeof handler === 'function' ? handler(args) : handler;
    return Promise.resolve({ data, error });
  });
}

const calls = (name: string) => mocks.rpc.mock.calls.filter(([n]) => n === name).map(([, args]) => args as Record<string, unknown>);
const NETWORK = { error: { message: 'TypeError: Failed to fetch', code: '' } };

afterEach(() => {
  mocks.rpc.mockReset();
  reloadPaths.mockReset();
});

describe('useDiagnosticRun', () => {
  it('shows the intro, starts, answers until done, then finishes and shows the report', async () => {
    server({
      diagnostic_status: { data: status() },
      start_diagnostic: { data: step(diagItem(1)) },
      answer_diagnostic: [{ data: step(diagItem(2)) }, { data: step(null, { done: true }) }],
      finish_diagnostic: { data: report() },
    });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('intro'));
    expect(result.current.resumable).toBe(false);

    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe('question'));
    expect(result.current.item?.id).toBe(diagItemId(1));
    expect(result.current.mode).toBe('full');
    expect(result.current.progress?.skills[0]?.status).toBe('active');
    expect(calls('start_diagnostic')).toEqual([{ p_path_id: PATH_ID, p_mode: 'full' }]);

    act(() => result.current.answer('b'));
    expect(result.current.status).toBe('submitting');
    await waitFor(() => expect(result.current.item?.id).toBe(diagItemId(2)));
    expect(result.current.status).toBe('question');

    act(() => result.current.answer(null));
    await waitFor(() => expect(result.current.status).toBe('report'));
    expect(result.current.report).toEqual(report());
    expect(result.current.item).toBeNull();
    expect(calls('answer_diagnostic')).toEqual([
      { p_attempt_id: ATTEMPT_ID, p_item_id: diagItemId(1), p_choice: 'b' },
      { p_attempt_id: ATTEMPT_ID, p_item_id: diagItemId(2), p_choice: null },
    ]);
    expect(calls('finish_diagnostic')).toEqual([{ p_attempt_id: ATTEMPT_ID }]);
  });

  it('starts in the mode given by the options or by start()', async () => {
    server({ diagnostic_status: { data: status() }, start_diagnostic: { data: step(diagItem(1), { mode: 'foundation' }) } });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID, { mode: 'foundation' }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('intro'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe('question'));
    expect(result.current.mode).toBe('foundation');
    expect(calls('start_diagnostic')).toEqual([{ p_path_id: PATH_ID, p_mode: 'foundation' }]);
  });

  it('resumes an attempt in progress on load (reload → continue)', async () => {
    server({
      diagnostic_status: { data: status({ status: 'in_progress', attempt_id: ATTEMPT_ID, can_start: true }) },
      start_diagnostic: { data: step(diagItem(5), { resumed: true }) },
    });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('question'));
    expect(result.current.item?.id).toBe(diagItemId(5));
    expect(result.current.resumable).toBe(true);
  });

  it('pauses back to the intro and resumes the same pending item', async () => {
    server({
      diagnostic_status: { data: status() },
      start_diagnostic: [{ data: step(diagItem(1)) }, { data: step(diagItem(1), { resumed: true }) }],
    });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('intro'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe('question'));
    act(() => result.current.pause());
    expect(result.current.status).toBe('intro');
    expect(result.current.resumable).toBe(true);
    expect(result.current.item).toBeNull();
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe('question'));
    expect(result.current.item?.id).toBe(diagItemId(1));
    expect(calls('start_diagnostic')).toHaveLength(2);
  });

  it('shows a retry state on a network error and resends the same answer for the same item', async () => {
    server({
      diagnostic_status: { data: status() },
      start_diagnostic: { data: step(diagItem(1)) },
      answer_diagnostic: [NETWORK, { data: step(diagItem(2)) }],
    });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('intro'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe('question'));
    act(() => result.current.answer('c'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    expect(result.current.item?.id).toBe(diagItemId(1));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.item?.id).toBe(diagItemId(2)));
    expect(result.current.status).toBe('question');
    expect(calls('answer_diagnostic')).toEqual([
      { p_attempt_id: ATTEMPT_ID, p_item_id: diagItemId(1), p_choice: 'c' },
      { p_attempt_id: ATTEMPT_ID, p_item_id: diagItemId(1), p_choice: 'c' },
    ]);
  });

  it('resyncs through start_diagnostic when the answer already landed', async () => {
    server({
      diagnostic_status: { data: status() },
      start_diagnostic: [{ data: step(diagItem(1)) }, { data: step(diagItem(2), { resumed: true }) }],
      answer_diagnostic: { error: { message: 'already_answered', code: 'P0001' } },
    });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('intro'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe('question'));
    act(() => result.current.answer('a'));
    await waitFor(() => expect(result.current.item?.id).toBe(diagItemId(2)));
    expect(result.current.status).toBe('question');
    expect(result.current.error).toBeNull();
  });

  it('shows other server errors and retries them', async () => {
    server({
      diagnostic_status: { data: status() },
      start_diagnostic: { data: step(diagItem(1)) },
      answer_diagnostic: [{ error: { message: 'invalid_choice', code: 'P0001' } }, { data: step(diagItem(2)) }],
    });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('intro'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe('question'));
    act(() => result.current.answer('z'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Phương án đã chọn không hợp lệ.');
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('question'));
  });

  it('skips a skill and moves to the next item', async () => {
    server({
      diagnostic_status: { data: status() },
      start_diagnostic: { data: step(diagItem(1)) },
      skip_diagnostic_skill: { data: step(diagItem(9, { skill: 'grammar' })) },
    });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('intro'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe('question'));
    act(() => result.current.skip('vocabulary', 'no_time'));
    await waitFor(() => expect(result.current.item?.skill).toBe('grammar'));
    expect(calls('skip_diagnostic_skill')).toEqual([{ p_attempt_id: ATTEMPT_ID, p_skill: 'vocabulary', p_reason: 'no_time' }]);
  });

  it('finishes early and retries a failed finish', async () => {
    server({
      diagnostic_status: { data: status() },
      start_diagnostic: { data: step(diagItem(1)) },
      finish_diagnostic: [NETWORK, { data: report({ early_stop: true }) }],
    });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('intro'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe('question'));
    act(() => result.current.finish());
    expect(result.current.status).toBe('finishing');
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('report'));
    expect(result.current.report?.early_stop).toBe(true);
    expect(calls('finish_diagnostic')).toEqual([{ p_attempt_id: ATTEMPT_ID }, { p_attempt_id: ATTEMPT_ID }]);
  });

  it('shows the latest report during the cooldown', async () => {
    server({
      diagnostic_status: {
        data: status({ status: 'completed', attempt_id: ATTEMPT_ID, can_start: false, retake_after: '2026-10-27T10:00:00Z' }),
      },
      finish_diagnostic: { data: report() },
    });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('report'));
    expect(result.current.retakeAfter).toBe('2026-10-27T10:00:00Z');
  });

  it('shows the intro after the cooldown unless the report is preferred', async () => {
    server({
      diagnostic_status: { data: status({ status: 'completed', attempt_id: ATTEMPT_ID, can_start: true }) },
      finish_diagnostic: { data: report() },
    });
    const first = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(first.result.current.status).toBe('intro'));
    const second = renderHook(() => useDiagnosticRun(PATH_ID, { preferReport: true }), { wrapper });
    await waitFor(() => expect(second.result.current.status).toBe('report'));
  });

  it('names the retake date when start hits the cooldown', async () => {
    server({
      diagnostic_status: { data: status({ status: 'abandoned', can_start: false, retake_after: '2026-10-27' }) },
      start_diagnostic: { error: { message: 'diagnostic_cooldown', code: 'P0001' } },
    });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('intro'));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Bạn vừa làm bài kiểm tra gần đây. Bạn có thể làm lại từ ngày 27/10/2026.');
  });

  it('maps a failed load and retries it', async () => {
    server({ diagnostic_status: [NETWORK, { data: status() }] });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('intro'));
  });

  it('errors without a path', async () => {
    server({});
    const { result } = renderHook(() => useDiagnosticRun(null), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Không tìm thấy lộ trình.');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('accepts the placement, marks the report applied and reloads the paths', async () => {
    server({
      diagnostic_status: { data: status({ status: 'completed', attempt_id: ATTEMPT_ID, can_start: false }) },
      finish_diagnostic: { data: report() },
      accept_diagnostic_placement: { data: placement() },
    });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('report'));
    let outcome: Awaited<ReturnType<typeof result.current.accept>> = null;
    await act(async () => {
      outcome = await result.current.accept();
    });
    expect(outcome).toEqual(placement());
    expect(result.current.report?.applied_at).not.toBeNull();
    expect(result.current.report?.current_level).toBe('a2');
    expect(reloadPaths).toHaveBeenCalledTimes(1);
  });

  it('returns null and keeps the report when accept fails', async () => {
    server({
      diagnostic_status: { data: status({ status: 'completed', attempt_id: ATTEMPT_ID, can_start: false }) },
      finish_diagnostic: { data: report() },
      accept_diagnostic_placement: { error: { message: 'already_applied', code: 'P0001' } },
    });
    const { result } = renderHook(() => useDiagnosticRun(PATH_ID), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('report'));
    let outcome: unknown = 'unset';
    await act(async () => {
      outcome = await result.current.accept();
    });
    expect(outcome).toBeNull();
    expect(result.current.status).toBe('report');
    expect(result.current.error).toBe('Kết quả này đã được áp dụng cho lộ trình.');
    expect(reloadPaths).not.toHaveBeenCalled();
  });
});

describe('useDiagnosticStatus', () => {
  it('loads, maps errors and reloads', async () => {
    let fail = true;
    server({ diagnostic_status: () => (fail ? { error: { message: 'path_not_found', code: 'P0001' } } : { data: status() }) });
    const { result } = renderHook(() => useDiagnosticStatus(PATH_ID), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Không tìm thấy lộ trình.');
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toEqual(status());
    expect(calls('diagnostic_status').at(-1)).toEqual({ p_path_id: PATH_ID });
  });

  it('errors without a path', async () => {
    server({});
    const { result } = renderHook(() => useDiagnosticStatus(null), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
