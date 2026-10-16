import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as reporting from '@/lib/error-reporting';
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

  it('reports the crash once through the error reporter', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const spy = vi.spyOn(reporting, 'reportRenderError').mockImplementation(() => {});
    renderBroken(false);
    expect(await screen.findByRole('heading', { name: 'Có lỗi xảy ra' })).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
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

function ChunkBoom(): never {
  throw new TypeError('Failed to fetch dynamically imported module: https://x/assets/LessonPage-abc.js');
}

function renderChunkFailure() {
  const router = createMemoryRouter([{ path: '/', element: <ChunkBoom />, errorElement: <RouteError /> }]);
  render(<RouterProvider router={router} />);
}

describe('RouteError: failed lazy chunk', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('offers the new version and reloads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    renderChunkFailure();
    expect(await screen.findByRole('heading', { level: 1, name: 'Đã có phiên bản mới' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Mã lỗi: ChunkLoadError');
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại trang' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('blames the network instead when offline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    renderChunkFailure();
    expect(await screen.findByRole('heading', { level: 1, name: 'Có lỗi xảy ra' })).toBeInTheDocument();
    expect(screen.getByText('Mất kết nối')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('shows a message-free error code for other crashes', async () => {
    vi.stubEnv('DEV', false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderBroken(false);
    expect(await screen.findByRole('alert')).toHaveTextContent('Mã lỗi: Error');
  });
});
