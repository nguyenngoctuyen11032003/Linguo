import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { publishMotivationPrefs } from '@/features/progress/prefs-events';
import { fakeQuery } from '../../../tests/unit/fake-supabase';
import { AnalyticsProvider } from './AnalyticsProvider';
import { configureAnalytics, pendingAnalyticsEvents, track } from './client';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn(() => Promise.resolve({ data: 0, error: null }));
  const prefs = { current: { data: { show_motivation: true, analytics_opt_out: false } as unknown, error: null as unknown } };
  const from = vi.fn();
  return { rpc, from, prefs, client: { rpc, from } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

function setPrefs(data: unknown, error: unknown = null) {
  mocks.prefs.current = { data, error };
}
mocks.from.mockImplementation(() => fakeQuery(mocks.prefs.current).builder);

function Probe() {
  // A child's passive effect (like RouteTracker's first page_view) runs after the provider configured the queue.
  useEffect(() => track('page_view'), []);
  return null;
}

function renderProvider(signedIn = true, child = <Probe />) {
  const auth: AuthState = signedIn
    ? { status: 'signed-in', session: null, user: { id: USER_ID } as User }
    : { status: 'signed-out', session: null, user: null };
  return render(
    <AuthContext.Provider value={auth}>
      <AnalyticsProvider>{child}</AnalyticsProvider>
    </AuthContext.Provider>,
  );
}

const sent = () => mocks.rpc.mock.calls.length;

afterEach(() => {
  configureAnalytics({ client: null, enabled: false });
  setPrefs({ show_motivation: true, analytics_opt_out: false });
  mocks.rpc.mockClear();
  mocks.from.mockClear();
});

describe('AnalyticsProvider', () => {
  it('enables tracking for a signed-in user and flushes on pagehide', async () => {
    renderProvider();
    // The child's page_view on mount is not lost.
    expect(pendingAnalyticsEvents()).toBe(1);
    await waitFor(() => expect(mocks.from).toHaveBeenCalledWith('user_preferences'));
    act(() => track('progress_viewed'));
    expect(pendingAnalyticsEvents()).toBe(2);
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await waitFor(() => expect(sent()).toBe(1));
    expect(mocks.rpc).toHaveBeenCalledWith('track_events', {
      p_events: [expect.objectContaining({ name: 'page_view' }), expect.objectContaining({ name: 'progress_viewed' })],
    });
    expect(pendingAnalyticsEvents()).toBe(0);
  });

  it('flushes when the page becomes hidden', async () => {
    renderProvider();
    act(() => track('progress_viewed'));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    visibility.mockRestore();
    await waitFor(() => expect(sent()).toBe(1));
  });

  it('is a no-op when signed out', async () => {
    renderProvider(false);
    act(() => track('progress_viewed'));
    expect(pendingAnalyticsEvents()).toBe(0);
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(sent()).toBe(0);
  });

  it('stops and drops the queue once the user turns out to be opted out', async () => {
    setPrefs({ show_motivation: true, analytics_opt_out: true });
    renderProvider();
    await waitFor(() => expect(pendingAnalyticsEvents()).toBe(0));
    act(() => track('progress_viewed'));
    expect(pendingAnalyticsEvents()).toBe(0);
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(sent()).toBe(0);
  });

  it('follows an opt-out toggled in Settings', async () => {
    renderProvider();
    await waitFor(() => expect(mocks.from).toHaveBeenCalled());
    act(() => publishMotivationPrefs(USER_ID, { show_motivation: true, analytics_opt_out: true }));
    act(() => track('progress_viewed'));
    expect(pendingAnalyticsEvents()).toBe(0);
    act(() => publishMotivationPrefs(USER_ID, { show_motivation: true, analytics_opt_out: false }));
    act(() => track('progress_viewed'));
    expect(pendingAnalyticsEvents()).toBe(1);
    // Another user's change is ignored.
    act(() => publishMotivationPrefs('22222222-2222-4222-8222-222222222222', { show_motivation: true, analytics_opt_out: true }));
    expect(pendingAnalyticsEvents()).toBe(1);
  });

  it('keeps tracking when the preferences cannot be read', async () => {
    setPrefs(null, { message: 'TypeError: Failed to fetch' });
    renderProvider();
    await waitFor(() => expect(mocks.from).toHaveBeenCalled());
    await act(async () => {});
    act(() => track('progress_viewed'));
    expect(pendingAnalyticsEvents()).toBeGreaterThan(0);
  });

  it('drops the queue on sign-out', () => {
    const view = renderProvider();
    act(() => track('progress_viewed'));
    view.unmount();
    expect(pendingAnalyticsEvents()).toBe(0);
  });
});
