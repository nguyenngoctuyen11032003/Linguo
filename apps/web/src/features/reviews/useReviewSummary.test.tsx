import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import { OutboxSyncProvider } from '@/features/lesson-player/OutboxSyncProvider';
import { createReviewOutbox } from './outbox';
import { PATH_ID, gradeArgs, gradeResult, summary } from './review-fixtures';
import { useReviewDue } from './useReviewDue';
import { useReviewSummary } from './useReviewSummary';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PATH = '30000000-0000-4000-8000-000000000002';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

function wrapper(options: { pathId?: string | null; withOutbox?: boolean } = {}) {
  const auth: AuthState = { status: 'signed-in', session: null, user: { id: USER_ID } as User };
  const paths: LearningPathsContextValue = {
    status: 'ready',
    error: null,
    paths: [],
    currentId: options.pathId === undefined ? PATH_ID : options.pathId,
    current: null,
    reload: vi.fn(),
    setCurrent: vi.fn(),
    upsertPath: vi.fn(),
  };
  return function Wrapper({ children }: { children: ReactNode }) {
    const inner = <LearningPathsContext.Provider value={paths}>{children}</LearningPathsContext.Provider>;
    return (
      <AuthContext.Provider value={auth}>
        {options.withOutbox === false ? inner : <OutboxSyncProvider>{inner}</OutboxSyncProvider>}
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

const summaryCalls = () => mocks.rpc.mock.calls.filter(([name]) => name === 'review_summary');

afterEach(() => {
  localStorage.clear();
  mocks.rpc.mockReset();
});

describe('useReviewSummary', () => {
  it('loads the summary of the current path', async () => {
    reply(() => ({ data: summary() }));
    const { result } = renderHook(() => useReviewSummary(), { wrapper: wrapper() });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.summary).toEqual(summary());
    expect(summaryCalls()).toEqual([['review_summary', { p_path_id: PATH_ID }]]);
  });

  it('accepts an explicit path and works without the outbox provider', async () => {
    reply(() => ({ data: summary() }));
    const { result } = renderHook(() => useReviewSummary(OTHER_PATH), { wrapper: wrapper({ withOutbox: false }) });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(summaryCalls()).toEqual([['review_summary', { p_path_id: OTHER_PATH }]]);
  });

  it('maps errors and reloads', async () => {
    let fail = true;
    reply(() => (fail ? { error: { message: 'path_not_found', code: 'P0001' } } : { data: summary() }));
    const { result } = renderHook(() => useReviewSummary(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Không tìm thấy lộ trình.');
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('errors without a path', async () => {
    reply(() => ({ data: summary() }));
    const { result } = renderHook(() => useReviewSummary(), { wrapper: wrapper({ pathId: null }) });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(summaryCalls()).toEqual([]);
  });

  it('refreshes when a queued grade reaches the server', async () => {
    createReviewOutbox(USER_ID).add({ args: gradeArgs(1), queueIndex: 0 });
    let remaining = 5;
    reply((name) => {
      if (name === 'grade_review') {
        remaining = 4;
        return { data: gradeResult(1) };
      }
      return { data: summary({ remaining_today: remaining }) };
    });
    const { result } = renderHook(() => useReviewSummary(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.summary?.remaining_today).toBe(4));
    expect(summaryCalls().length).toBeGreaterThanOrEqual(1);
  });
});

describe('useReviewDue', () => {
  it('exposes remaining_today as the due count', async () => {
    reply(() => ({ data: summary({ remaining_today: 12, recovery_mode: true }) }));
    const { result } = renderHook(() => useReviewDue(), { wrapper: wrapper() });
    expect(result.current.count).toBe(0);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.count).toBe(12);
    expect(result.current.recoveryMode).toBe(true);
  });
});
