import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAdmin, routeRpcs } from './admin-test-utils';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc }, isFramed: vi.fn(() => false), breakOutOfFrame: vi.fn() };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));
vi.mock('@/features/admin/frame-guard', () => ({ isFramed: mocks.isFramed, breakOutOfFrame: mocks.breakOutOfFrame }));

afterEach(() => {
  mocks.rpc.mockReset();
  mocks.isFramed.mockReset().mockReturnValue(false);
  mocks.breakOutOfFrame.mockReset();
});

describe('AdminLayout frame guard', () => {
  it('renders the admin navigation when the page is top-level', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'editor' }, admin_content_overview: { data: null, error: { message: 'x', code: 'X' } } });
    renderAdmin('/quan-tri');
    expect(await screen.findByRole('navigation', { name: 'Điều hướng quản trị' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page');
    // One sideways-scrolling row on phones, never wrapped into several rows (UX audit, 320px).
    const list = screen.getByRole('navigation', { name: 'Điều hướng quản trị' }).querySelector('ul');
    expect(list).toHaveClass('flex-nowrap', 'overflow-x-auto', 'lg:flex-col');
    expect(list).not.toHaveClass('flex-wrap');
    expect(mocks.breakOutOfFrame).not.toHaveBeenCalled();
  });

  it('makes the skip-link target focusable from script but not a tab stop', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'editor' }, admin_content_overview: { data: null, error: { message: 'x', code: 'X' } } });
    renderAdmin('/quan-tri');
    await screen.findByRole('navigation', { name: 'Điều hướng quản trị' });
    expect(screen.getByRole('link', { name: 'Bỏ qua tới nội dung' })).toHaveAttribute('href', '#main');
    const main = document.getElementById('main');
    expect(main?.tagName).toBe('MAIN');
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('scrolls the tab row (not the page) so the current tab is visible when the row overflows', async () => {
    const scrollTo = vi.fn();
    const proto = HTMLElement.prototype as HTMLElement & { scrollTo?: unknown };
    const originalScrollTo = proto.scrollTo;
    proto.scrollTo = scrollTo;
    const isActive = (el: HTMLElement) => el.getAttribute('aria-current') === 'page';
    const spies = [
      vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(800),
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320),
      vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
        return isActive(this) ? 600 : 0;
      }),
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100),
    ];
    try {
      routeRpcs(mocks.rpc, { staff_role: { data: 'admin' } });
      renderAdmin('/quan-tri/nhat-ky');
      expect(await screen.findByRole('link', { name: 'Nhật ký' })).toHaveAttribute('aria-current', 'page');
      await vi.waitFor(() => expect(scrollTo).toHaveBeenCalled());
      // Centred in a 320px row: 600 - (320 - 100) / 2.
      expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 490 }));
      expect(scrollTo.mock.contexts.at(-1)).toBe(screen.getByRole('navigation', { name: 'Điều hướng quản trị' }).querySelector('ul'));
    } finally {
      spies.forEach((spy) => spy.mockRestore());
      if (originalScrollTo === undefined) delete proto.scrollTo;
      else proto.scrollTo = originalScrollTo;
    }
  });

  it('renders nothing sensitive inside a frame, breaks out and does not load admin data', async () => {
    mocks.isFramed.mockReturnValue(true);
    routeRpcs(mocks.rpc, { staff_role: { data: 'admin' } });
    renderAdmin('/quan-tri');
    expect(await screen.findByText('Trang quản trị không được hiển thị bên trong trang khác.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng quản trị' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở trang quản trị trong cửa sổ riêng' })).toHaveAttribute('target', '_top');
    expect(mocks.breakOutOfFrame).toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith('admin_content_overview', expect.anything());
  });
});
