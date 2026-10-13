import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, type FakeClient, type FakeRpc } from '../../../tests/unit/fake-supabase';
import { FIXTURE_PATH_ID, FIXTURE_SESSION_ID, studySession } from './session-fixtures';
import { useSessionReturn } from './useSessionReturn';
import { useTodaySession } from './useTodaySession';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

function setClient(rpcs: Record<string, FakeRpc>): FakeClient {
  const client = fakeClient({}, rpcs);
  mocks.client = client;
  return client;
}

describe('useTodaySession', () => {
  it('loads today for the path', async () => {
    const result = { session: studySession(), studied_seconds_today: 120, daily_goal_minutes: 30 };
    const client = setClient({ get_today_session: { data: result } });
    const { result: hook } = renderHook(() => useTodaySession(FIXTURE_PATH_ID));
    expect(hook.current.status).toBe('loading');
    await waitFor(() => expect(hook.current.status).toBe('ready'));
    expect(hook.current.data).toEqual(result);
    expect(client.rpcCalls).toEqual([['get_today_session', { p_path_id: FIXTURE_PATH_ID }]]);
  });

  it('is unavailable when the RPC is not deployed', async () => {
    setClient({ get_today_session: { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } });
    const { result: hook } = renderHook(() => useTodaySession(FIXTURE_PATH_ID));
    await waitFor(() => expect(hook.current.status).toBe('unavailable'));
  });

  it('is unavailable without a backend', async () => {
    mocks.client = null;
    const { result: hook } = renderHook(() => useTodaySession(FIXTURE_PATH_ID));
    await waitFor(() => expect(hook.current.status).toBe('unavailable'));
  });

  it('reports other failures and retries on reload', async () => {
    const rpcs: Record<string, FakeRpc> = { get_today_session: { data: null, error: { message: 'boom', status: 500 } } };
    const client = setClient(rpcs);
    const { result: hook } = renderHook(() => useTodaySession(FIXTURE_PATH_ID));
    await waitFor(() => expect(hook.current.status).toBe('error'));
    rpcs.get_today_session = { data: { session: null, studied_seconds_today: 0, daily_goal_minutes: 15 } };
    act(() => hook.current.reload());
    await waitFor(() => expect(hook.current.status).toBe('ready'));
    expect(hook.current.data?.daily_goal_minutes).toBe(15);
    expect(client.rpcCalls).toHaveLength(2);
  });
});

describe('useSessionReturn', () => {
  const ITEM_LINK = `?phien=${FIXTURE_SESSION_ID}&muc=a2`;
  let locations: string[] = [];

  function Probe() {
    const location = useLocation();
    locations.push(location.pathname + location.search);
    return null;
  }

  function wrapper(route: string) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  {children}
                  <Probe />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      );
    };
  }

  beforeEach(() => {
    locations = [];
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing without a session link', async () => {
    const client = setClient({});
    const { result } = renderHook(() => useSessionReturn(), { wrapper: wrapper('/app/on-tap') });
    expect(result.current.link).toBeNull();
    expect(await result.current.reportDone()).toBe(false);
    expect(client.rpcCalls).toEqual([]);
  });

  it('reports done once with the seconds since the page opened, capped', async () => {
    const client = setClient({ update_session_item: { data: null } });
    const { result } = renderHook(() => useSessionReturn(), { wrapper: wrapper(`/app/hoc-tap/bai/x${ITEM_LINK}`) });
    expect(result.current.link).toEqual({ sessionId: FIXTURE_SESSION_ID, itemId: 'a2', reviewLimit: null });
    vi.setSystemTime(new Date('2026-10-13T08:04:05Z'));
    await act(async () => {
      await Promise.all([result.current.reportDone(), result.current.reportDone()]);
    });
    expect(result.current.status).toBe('saved');
    await act(async () => {
      await result.current.reportDone();
    });
    expect(client.rpcCalls).toEqual([
      ['update_session_item', { p_session_id: FIXTURE_SESSION_ID, p_item_id: 'a2', p_status: 'done', p_seconds: 245 }],
    ]);
  });

  it('caps a very long visit', async () => {
    const client = setClient({ update_session_item: { data: null } });
    const { result } = renderHook(() => useSessionReturn(), { wrapper: wrapper(`/app/on-tap${ITEM_LINK}`) });
    vi.setSystemTime(new Date('2026-10-14T08:00:00Z'));
    await act(async () => {
      await result.current.reportDone();
    });
    expect(client.rpcCalls[0]?.[1]).toMatchObject({ p_seconds: 7200 });
  });

  it('retries a failed report on the way back and returns to the session page either way', async () => {
    const rpcs: Record<string, FakeRpc> = { update_session_item: { data: null, error: { message: 'boom', status: 500 } } };
    const client = setClient(rpcs);
    const { result } = renderHook(() => useSessionReturn(), { wrapper: wrapper(`/app/on-tap${ITEM_LINK}`) });
    await act(async () => {
      expect(await result.current.reportDone()).toBe(false);
    });
    expect(result.current.status).toBe('error');
    await act(async () => {
      await result.current.returnToSession();
    });
    expect(client.rpcCalls).toHaveLength(2);
    expect(locations.at(-1)).toBe('/app/phien-hoc');
  });
});
