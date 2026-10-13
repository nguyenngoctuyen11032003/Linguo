import { act, render } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { configureAnalytics, flushAnalytics, setAnalyticsRoute } from './client';
import { RouteTracker } from './RouteTracker';

const LESSON_A = '40000000-0000-4000-8000-000000000001';
const LESSON_B = '40000000-0000-4000-8000-000000000002';

const rpc = vi.fn(() => Promise.resolve({ data: 0, error: null }));

function Layout() {
  return (
    <>
      <RouteTracker />
      <Outlet />
    </>
  );
}

function setup(initial: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/app',
        element: <Layout />,
        children: [
          { index: true, element: <p>home</p> },
          { path: 'tien-do', element: <p>progress</p> },
          { path: 'hoc-tap/bai/:lessonId', element: <p>lesson</p> },
        ],
      },
    ],
    { initialEntries: [initial] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

async function sentEvents() {
  await flushAnalytics();
  return rpc.mock.calls.flatMap((call) => (call as unknown as [string, { p_events: Array<{ name: string; route: string | null }> }])[1].p_events);
}

beforeEach(() => {
  configureAnalytics({ client: { rpc } as unknown as AppSupabaseClient, enabled: true });
});

afterEach(() => {
  configureAnalytics({ client: null, enabled: false });
  setAnalyticsRoute(null);
  rpc.mockClear();
});

describe('RouteTracker', () => {
  it('emits page_view with the route pattern, without ids or query strings', async () => {
    setup(`/app/hoc-tap/bai/${LESSON_A}?buoc=3#x`);
    const events = await sentEvents();
    expect(events).toEqual([expect.objectContaining({ name: 'page_view', route: '/app/hoc-tap/bai/:lessonId', props: {} })]);
    expect(JSON.stringify(events)).not.toContain(LESSON_A);
    expect(JSON.stringify(events)).not.toContain('buoc');
  });

  it('emits once per pattern change only', async () => {
    const router = setup(`/app/hoc-tap/bai/${LESSON_A}`);
    await act(() => router.navigate(`/app/hoc-tap/bai/${LESSON_B}`));
    await act(() => router.navigate(`/app/hoc-tap/bai/${LESSON_B}?buoc=2`));
    await act(() => router.navigate('/app/tien-do'));
    await act(() => router.navigate('/app'));
    const events = await sentEvents();
    expect(events.map((e) => e.route)).toEqual(['/app/hoc-tap/bai/:lessonId', '/app/tien-do', '/app']);
  });

  it('tags later events with the current route', async () => {
    const router = setup('/app/tien-do');
    await act(() => router.navigate(`/app/hoc-tap/bai/${LESSON_A}`));
    const { track } = await import('./client');
    track('lesson_started');
    const events = await sentEvents();
    expect(events.at(-1)).toMatchObject({ name: 'lesson_started', route: '/app/hoc-tap/bai/:lessonId' });
  });
});
