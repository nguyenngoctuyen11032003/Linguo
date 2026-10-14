import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { TEST_KO_PATH, TEST_PATH } from '../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../tests/unit/render';
import { AppBar } from './AppBar';
import { AppLayout } from './AppLayout';
import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';

vi.mock('@/lib/supabase', () => ({ getSupabase: () => null, requireSupabase: () => ({}) }));

describe('BottomNav', () => {
  it('has five tabs and marks the current one', () => {
    renderWithProviders(<BottomNav onMore={() => {}} />, { route: '/app/on-tap' });
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.querySelectorAll('li')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Ôn tập' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Trang chủ' })).not.toHaveAttribute('aria-current');
  });

  it('keeps tab labels at 12 px or larger', () => {
    renderWithProviders(<BottomNav onMore={() => {}} />, { route: '/app' });
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    for (const tab of nav.querySelectorAll('a, button')) expect(tab.className).not.toMatch(/text-\[1[01]px\]/);
    expect(screen.getByRole('link', { name: 'Ôn tập' }).className).toContain('text-xs');
  });

  it('opens "Thêm"', async () => {
    const onMore = vi.fn();
    renderWithProviders(<BottomNav onMore={onMore} />, { route: '/app' });
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(onMore).toHaveBeenCalledOnce();
  });
});

describe('MoreSheet', () => {
  it('lists secondary destinations and closes on Escape', async () => {
    localStorage.setItem('linguo-reduce-motion', 'true');
    const onClose = vi.fn();
    renderWithProviders(<MoreSheet open onClose={onClose} />, { route: '/app' });
    const dialog = screen.getByRole('dialog', { name: 'Thêm' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Luyện thi/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tiến độ/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cài đặt/ })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

function MoreHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/app/tien-do')}>
        Đi tới tiến độ
      </button>
      <BottomNav onMore={() => setOpen(true)} moreOpen={open} moreTriggerRef={triggerRef} />
      <MoreSheet open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} />
    </>
  );
}

describe('MoreSheet focus management', () => {
  it('moves focus in, traps Tab, and restores focus to "Thêm" on Escape', async () => {
    localStorage.setItem('linguo-reduce-motion', 'true');
    renderWithProviders(<MoreHarness />, { route: '/app' });
    const trigger = screen.getByRole('button', { name: 'Thêm' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const dialog = screen.getByRole('dialog', { name: 'Thêm' });
    const close = screen.getByRole('button', { name: 'Đóng' });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');

    const links = screen.getAllByRole('link').filter((link) => dialog.contains(link));
    const last = links[links.length - 1]!;
    await userEvent.tab({ shift: true });
    expect(last).toHaveFocus(); // Shift+Tab from the first element wraps to the last
    await userEvent.tab();
    expect(close).toHaveFocus(); // Tab from the last element wraps to the first
    for (let i = 0; i < links.length + 1; i++) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.body.style.overflow).toBe('');
  });

  it('closes when the route changes', async () => {
    localStorage.setItem('linguo-reduce-motion', 'true');
    renderWithProviders(<MoreHarness />, { route: '/app' });
    await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(screen.getByRole('dialog', { name: 'Thêm' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Đi tới tiến độ' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('AppBar', () => {
  it('shows the language pill and an avatar link to settings', () => {
    renderWithProviders(<AppBar />, { route: '/app' });
    expect(screen.getByRole('button', { name: /Ngôn ngữ đang học/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tài khoản và cài đặt' })).toHaveTextContent('M');
  });

  it('switches the current path', async () => {
    const setCurrent = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<AppBar />, { route: '/app', paths: { paths: [TEST_PATH, TEST_KO_PATH], setCurrent } });
    await userEvent.click(screen.getByRole('button', { name: /Ngôn ngữ đang học/ }));
    await userEvent.click(screen.getByRole('button', { name: /Tiếng Hàn/ }));
    expect(setCurrent).toHaveBeenCalledWith('path-ko');
    await waitFor(() => expect(screen.getByRole('button', { name: /Ngôn ngữ đang học/ })).not.toHaveAttribute('aria-busy'));
  });

  it('shows a busy trigger while switching and ignores new selections', async () => {
    let resolve!: () => void;
    const setCurrent = vi.fn().mockReturnValue(new Promise<void>((r) => (resolve = r)));
    renderWithProviders(<AppBar />, { route: '/app', paths: { paths: [TEST_PATH, TEST_KO_PATH], setCurrent } });
    const trigger = screen.getByRole('button', { name: /Ngôn ngữ đang học/ });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: /Tiếng Hàn/ }));
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(trigger);
    expect(screen.getByRole('button', { name: /Tiếng Hàn/ })).toBeDisabled();
    expect(setCurrent).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() => expect(trigger).not.toHaveAttribute('aria-busy'));
  });

  it('toasts an error when switching fails', async () => {
    const setCurrent = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    renderWithProviders(<AppBar />, { route: '/app', paths: { paths: [TEST_PATH, TEST_KO_PATH], setCurrent } });
    await userEvent.click(screen.getByRole('button', { name: /Ngôn ngữ đang học/ }));
    await userEvent.click(screen.getByRole('button', { name: /Tiếng Hàn/ }));
    expect(await screen.findByText('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ngôn ngữ đang học/ })).not.toHaveAttribute('aria-busy');
  });

  it('navigates to onboarding for a missing language', async () => {
    renderWithProviders(<AppBar />, { route: '/app' });
    await userEvent.click(screen.getByRole('button', { name: /Ngôn ngữ đang học/ }));
    await userEvent.click(screen.getByRole('button', { name: '+ Thêm Tiếng Hàn' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/app/bat-dau?lang=ko');
  });
});

describe('AppLayout', () => {
  it('renders the routed child inside the main landmark', () => {
    renderWithProviders(
      <Routes>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<h1>Nội dung thử</h1>} />
        </Route>
      </Routes>,
      { route: '/app' },
    );
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 1, name: 'Nội dung thử' }));
  });
});
