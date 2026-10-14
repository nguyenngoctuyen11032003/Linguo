import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef } from 'react';
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TITLE } from '@/lib/route-titles';
import { RouteAnnouncer } from './RouteAnnouncer';

function Shell() {
  return (
    <>
      <nav>
        <Link to="/">Trang đầu</Link>
        <Link to="/app/on-tap">Tới ôn tập</Link>
        <Link to="/app/on-tap?tab=2">Đổi tab</Link>
        <Link to="/app/bat-dau">Tới onboarding</Link>
        <Link to="/app/cai-dat">Tới cài đặt</Link>
      </nav>
      <main id="main">
        <Outlet />
      </main>
      <RouteAnnouncer />
    </>
  );
}

/** Mimics onboarding / placement test: the page focuses its own heading when it mounts. */
function SelfFocusingPage() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h1 ref={ref} tabIndex={-1}>
      Bắt đầu
    </h1>
  );
}

function setup(initial: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Shell />,
        children: [
          { index: true, element: <h1>Linguo</h1> },
          { path: 'app/on-tap', element: <h1>Ôn tập</h1> },
          { path: 'app/bat-dau', element: <SelfFocusingPage /> },
          { path: 'app/cai-dat', element: <p>Không có tiêu đề</p> },
        ],
      },
    ],
    { initialEntries: [initial] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('RouteAnnouncer', () => {
  it('sets the document title from the route and does not announce or steal focus on first load', () => {
    setup('/app/on-tap');
    expect(document.title).toBe('Ôn tập · Linguo');
    expect(screen.getAllByRole('status')[0]).toBeEmptyDOMElement();
    expect(document.body).toHaveFocus();
  });

  it('uses the full tagline title on the landing page', () => {
    setup('/');
    expect(document.title).toBe(DEFAULT_TITLE);
  });

  it('updates the title, announces the page and focuses its heading after navigating', async () => {
    setup('/');
    await userEvent.click(screen.getByRole('link', { name: 'Tới ôn tập' }));
    expect(document.title).toBe('Ôn tập · Linguo');
    expect(screen.getByRole('status')).toHaveTextContent('Ôn tập');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ôn tập' })).toHaveFocus());
  });

  it('falls back to the main landmark when the page has no heading', async () => {
    setup('/');
    await userEvent.click(screen.getByRole('link', { name: 'Tới cài đặt' }));
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    expect(document.title).toBe('Cài đặt · Linguo');
  });

  it('leaves focus and announcements alone for search-param-only changes', async () => {
    setup('/app/on-tap');
    const link = screen.getByRole('link', { name: 'Đổi tab' });
    await userEvent.click(link);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(link).toHaveFocus();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('does not override a page that placed focus itself', async () => {
    setup('/');
    await userEvent.click(screen.getByRole('link', { name: 'Tới onboarding' }));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(screen.getByRole('heading', { name: 'Bắt đầu' })).toHaveFocus();
    expect(document.title).toBe('Bắt đầu · Linguo');
  });

  it('makes the focused heading a programmatic-only target without a focus ring', async () => {
    setup('/');
    await userEvent.click(screen.getByRole('link', { name: 'Tới ôn tập' }));
    const heading = await screen.findByRole('heading', { name: 'Ôn tập' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading.style.outline).toContain('none');
  });
});
