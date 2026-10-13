import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ProgressRange } from '@linguo/shared';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { dashboardFixture, PROGRESS_PATH_ID } from './progress-fixtures';
import { useProgressDashboard } from './useProgressDashboard';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PATH = '30000000-0000-4000-8000-000000000002';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } as { rpc: typeof rpc } | null };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

function wrapper(signedIn = true) {
  const auth: AuthState = signedIn
    ? { status: 'signed-in', session: null, user: { id: USER_ID } as User }
    : { status: 'signed-out', session: null, user: null };
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
  };
}

type Resolver = (value: { data: unknown; error: unknown }) => void;

function deferredRpc() {
  const pending: Resolver[] = [];
  mocks.rpc.mockImplementation(() => new Promise((resolve: Resolver) => pending.push(resolve)));
  return pending;
}

afterEach(() => {
  mocks.rpc.mockReset();
  mocks.client = { rpc: mocks.rpc };
});

describe('useProgressDashboard', () => {
  it('is idle without a path or a signed-in user', () => {
    const noPath = renderHook(() => useProgressDashboard(null, 7), { wrapper: wrapper() });
    expect(noPath.result.current).toMatchObject({ status: 'idle', data: null, error: null });
    const signedOut = renderHook(() => useProgressDashboard(PROGRESS_PATH_ID, 7), { wrapper: wrapper(false) });
    expect(signedOut.result.current.status).toBe('idle');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('loads the dashboard of the path and range', async () => {
    mocks.rpc.mockResolvedValue({ data: dashboardFixture(), error: null });
    const { result } = renderHook(() => useProgressDashboard(PROGRESS_PATH_ID, 7), { wrapper: wrapper() });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toEqual(dashboardFixture());
    expect(mocks.rpc).toHaveBeenCalledWith('get_progress_dashboard', { p_path_id: PROGRESS_PATH_ID, p_range_days: 7 });
  });

  it('keeps the previous range on screen while another range loads', async () => {
    const pending = deferredRpc();
    const { result, rerender } = renderHook(({ range }: { range: ProgressRange }) => useProgressDashboard(PROGRESS_PATH_ID, range), {
      wrapper: wrapper(),
      initialProps: { range: 7 },
    });
    await act(async () => pending[0]!({ data: dashboardFixture(), error: null }));
    expect(result.current.status).toBe('ready');

    rerender({ range: 28 });
    expect(result.current.status).toBe('loading');
    expect(result.current.data?.range_days).toBe(7);

    await act(async () => pending[1]!({ data: dashboardFixture({ range_days: 28 }), error: null }));
    expect(result.current.status).toBe('ready');
    expect(result.current.data?.range_days).toBe(28);
  });

  it('drops the data of another path', async () => {
    const pending = deferredRpc();
    const { result, rerender } = renderHook(({ path }: { path: string }) => useProgressDashboard(path, 7), {
      wrapper: wrapper(),
      initialProps: { path: PROGRESS_PATH_ID },
    });
    await act(async () => pending[0]!({ data: dashboardFixture(), error: null }));
    rerender({ path: OTHER_PATH });
    expect(result.current).toMatchObject({ status: 'loading', data: null });
  });

  it('ignores a stale answer after the range changed', async () => {
    const pending = deferredRpc();
    const { result, rerender } = renderHook(({ range }: { range: ProgressRange }) => useProgressDashboard(PROGRESS_PATH_ID, range), {
      wrapper: wrapper(),
      initialProps: { range: 7 },
    });
    rerender({ range: 14 });
    await act(async () => pending[1]!({ data: dashboardFixture({ range_days: 14 }), error: null }));
    await act(async () => pending[0]!({ data: dashboardFixture({ range_days: 7 }), error: null }));
    expect(result.current.data?.range_days).toBe(14);
  });

  it('maps errors and reloads', async () => {
    let fail = true;
    mocks.rpc.mockImplementation(() =>
      Promise.resolve(fail ? { data: null, error: { message: 'path_not_found', code: 'P0001' } } : { data: dashboardFixture(), error: null }),
    );
    const { result } = renderHook(() => useProgressDashboard(PROGRESS_PATH_ID, 7), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Không tìm thấy lộ trình.');
    expect(result.current.data).toBeNull();

    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('reports an unconfigured client', async () => {
    mocks.client = null;
    const { result } = renderHook(() => useProgressDashboard(PROGRESS_PATH_ID, 7), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Chưa cấu hình kết nối máy chủ.');
  });
});
