import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../tests/unit/render';
import { ComingSoonPage } from '@/routes/app/ComingSoonPage';
import { HomePage } from '@/routes/app/HomePage';
import { AppBar } from './AppBar';
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
});

describe('HomePage', () => {
  it('greets by display name and shows the onboarding empty state without fake numbers', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chào Minh Anh');
    expect(screen.getByRole('heading', { name: 'Bắt đầu lộ trình đầu tiên' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo lộ trình' })).toBeDisabled();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('announces loading in the heading while the profile loads', () => {
    renderWithProviders(<HomePage />, { route: '/app', profile: { status: 'loading', profile: null } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Đang tải…');
  });

  it('falls back to "bạn" without a name', () => {
    renderWithProviders(<HomePage />, {
      route: '/app',
      profile: { profile: { id: 'u', displayName: '', timezone: 'Asia/Ho_Chi_Minh' } },
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chào bạn');
  });
});

describe('ComingSoonPage', () => {
  it('names the feature', () => {
    renderWithProviders(<ComingSoonPage title="Ôn tập" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ôn tập' })).toBeInTheDocument();
    expect(screen.getByText(/Tính năng Ôn tập đang được xây dựng/)).toBeInTheDocument();
  });
});
