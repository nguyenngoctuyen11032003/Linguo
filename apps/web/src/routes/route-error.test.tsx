import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteError } from './RouteError';

function Boom(): never {
  throw new Error('secret stack detail');
}

function renderBroken(inMain: boolean) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <div>
            <nav>Thanh điều hướng</nav>
            <Outlet />
          </div>
        ),
        children: [{ path: 'hong', element: <Boom />, errorElement: <RouteError inMain={inMain} /> }],
      },
    ],
    { initialEntries: ['/hong'] },
  );
  render(<RouterProvider router={router} />);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('RouteError', () => {
  it('shows Vietnamese recovery actions inside the parent layout', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    renderBroken(false);
    expect(await screen.findByRole('heading', { level: 1, name: 'Có lỗi xảy ra' })).toBeInTheDocument();
    expect(screen.getByText('Thanh điều hướng')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not add a second main landmark inside a layout that has one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderBroken(true);
    expect(await screen.findByRole('heading', { name: 'Có lỗi xảy ra' })).toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });

  it('never shows the stack or message in production', async () => {
    vi.stubEnv('DEV', false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderBroken(false);
    expect(await screen.findByRole('heading', { name: 'Có lỗi xảy ra' })).toBeInTheDocument();
    expect(screen.queryByTestId('route-error-detail')).not.toBeInTheDocument();
    expect(screen.queryByText(/secret stack detail/)).not.toBeInTheDocument();
  });
});
