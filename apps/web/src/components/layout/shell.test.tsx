import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    localStorage.setItem('lp-reduce-motion', 'true');
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
