import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetNotificationClickListener } from '@/features/pwa/notification-click';
import { SW_NOTIFICATION_CLICKED } from '@/features/pwa/sw-helpers';
import { appPathFrom } from '@/features/pwa/app-path';
import { PwaBridge } from './PwaBridge';

const markNotification = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
vi.mock('@/lib/supabase-loader', () => ({ loadSupabase: () => Promise.resolve({}) }));
vi.mock('@/features/notifications/service', () => ({ markNotification: (...args: unknown[]) => markNotification(...args) }));

const ORIGIN = 'https://linguo.example';
const ID = '00000000-0000-4000-8000-000000000001';

describe('appPathFrom', () => {
  it('maps an absolute in-app URL to a router path, keeping query and hash', () => {
    expect(appPathFrom(`${ORIGIN}/app/on-tap?from=push#top`, ORIGIN, '/')).toBe('/app/on-tap?from=push#top');
    expect(appPathFrom(`${ORIGIN}/Linguo/app/thong-bao`, ORIGIN, '/Linguo/')).toBe('/app/thong-bao');
    expect(appPathFrom(`${ORIGIN}/app`, ORIGIN, '/')).toBe('/app');
  });

  it('falls back to /app outside the origin, the base path or the app', () => {
    expect(appPathFrom('https://evil.example/app/on-tap', ORIGIN, '/')).toBe('/app');
    expect(appPathFrom(`${ORIGIN}/other/app/on-tap`, ORIGIN, '/Linguo/')).toBe('/app');
    expect(appPathFrom(`${ORIGIN}/dang-nhap`, ORIGIN, '/')).toBe('/app');
    expect(appPathFrom(`${ORIGIN}/application`, ORIGIN, '/')).toBe('/app');
  });
});

class FakeContainer extends EventTarget {
  startMessages = vi.fn();
}

describe('PwaBridge', () => {
  afterEach(() => {
    resetNotificationClickListener();
    markNotification.mockClear();
  });

  it('marks a clicked notification and routes to it when the SW could not navigate', async () => {
    const container = new FakeContainer();
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
    const router = createMemoryRouter(
      [
        { path: '/app', element: <PwaBridge /> },
        { path: '/app/on-tap', element: <h1>Ôn tập</h1> },
      ],
      { initialEntries: ['/app'] },
    );
    render(<RouterProvider router={router} />);
    act(() => {
      container.dispatchEvent(
        new MessageEvent('message', { data: { type: SW_NOTIFICATION_CLICKED, notification_id: ID, url: `${window.location.origin}/app/on-tap`, navigated: false } }),
      );
    });
    expect(await screen.findByRole('heading', { name: 'Ôn tập' })).toBeInTheDocument();
    await vi.waitFor(() => expect(markNotification).toHaveBeenCalledWith(expect.anything(), ID, 'clicked'));
  });

  function renderAt(initial: string) {
    const container = new FakeContainer();
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
    const router = createMemoryRouter(
      [
        { path: '/app/hoc-tap/bai/:id', element: <PwaBridge /> },
        { path: '/app/luyen-thi/lam-bai/:id', element: <PwaBridge /> },
        { path: '/app/tien-do', element: <PwaBridge /> },
        { path: '/app/on-tap', element: <h1>Ôn tập</h1> },
      ],
      { initialEntries: [initial] },
    );
    render(<RouterProvider router={router} />);
    const click = (navigated: boolean) =>
      act(() => {
        container.dispatchEvent(
          new MessageEvent('message', {
            data: { type: SW_NOTIFICATION_CLICKED, notification_id: ID, url: `${window.location.origin}/app/on-tap`, navigated },
          }),
        );
      });
    return { router, click };
  }

  it('does not leave a lesson: it marks the click and offers an "Mở" toast instead of navigating', async () => {
    const { router, click } = renderAt('/app/hoc-tap/bai/abc');
    click(false);
    expect(await screen.findByTestId('notification-open-toast')).toBeInTheDocument();
    await vi.waitFor(() => expect(markNotification).toHaveBeenCalledWith(expect.anything(), ID, 'clicked'));
    expect(router.state.location.pathname).toBe('/app/hoc-tap/bai/abc');
    await userEvent.click(screen.getByRole('button', { name: 'Mở' }));
    expect(await screen.findByRole('heading', { name: 'Ôn tập' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/on-tap');
  });

  it('also protects exam attempts, and "Để sau" keeps the learner where they are', async () => {
    const { router, click } = renderAt('/app/luyen-thi/lam-bai/7');
    click(false);
    await userEvent.click(await screen.findByRole('button', { name: 'Để sau' }));
    expect(screen.queryByTestId('notification-open-toast')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/luyen-thi/lam-bai/7');
    await vi.waitFor(() => expect(markNotification).toHaveBeenCalledTimes(1));
  });

  it('routes straight away from an ordinary page', async () => {
    const { router, click } = renderAt('/app/tien-do');
    click(false);
    expect(await screen.findByRole('heading', { name: 'Ôn tập' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/on-tap');
    await vi.waitFor(() => expect(markNotification).toHaveBeenCalledWith(expect.anything(), ID, 'clicked'));
  });

  it('only marks the click when the window already shows the target', async () => {
    const { router, click } = renderAt('/app/hoc-tap/bai/abc');
    click(true);
    await vi.waitFor(() => expect(markNotification).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('notification-open-toast')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app/hoc-tap/bai/abc');
  });
});
