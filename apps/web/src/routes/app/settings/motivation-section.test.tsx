import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MotivationPrefs } from '@linguo/shared';
import { renderWithProviders } from '../../../../tests/unit/render';
import { MotivationSection } from './MotivationSection';

const mocks = vi.hoisted(() => ({ state: null as unknown, update: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/progress/useMotivationPrefs', () => ({ useMotivationPrefs: () => mocks.state }));

function prefsState(prefs: MotivationPrefs | null, extra: Record<string, unknown> = {}) {
  return { status: prefs ? 'ready' : 'loading', prefs, update: mocks.update, saving: false, error: null, ...extra };
}

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.state = prefsState({ show_motivation: true, analytics_opt_out: false });
});

describe('MotivationSection', () => {
  it('shows both switches with their current values', () => {
    renderWithProviders(<MotivationSection />, { route: '/app/cai-dat' });
    expect(screen.getByRole('heading', { level: 2, name: 'Động lực và dữ liệu' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Hiện chuỗi ngày, XP và huy hiệu' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Gửi thống kê sử dụng' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Không kèm tên, email hay nội dung câu trả lời/)).toBeInTheDocument();
  });

  it('switches motivation off', async () => {
    renderWithProviders(<MotivationSection />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('switch', { name: 'Hiện chuỗi ngày, XP và huy hiệu' }));
    expect(mocks.update).toHaveBeenCalledWith({ show_motivation: false });
  });

  it('opts out of analytics and back in', async () => {
    renderWithProviders(<MotivationSection />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('switch', { name: 'Gửi thống kê sử dụng' }));
    expect(mocks.update).toHaveBeenCalledWith({ analytics_opt_out: true });

    mocks.state = prefsState({ show_motivation: true, analytics_opt_out: true });
    renderWithProviders(<MotivationSection />, { route: '/app/cai-dat' });
    const [, second] = screen.getAllByRole('switch', { name: 'Gửi thống kê sử dụng' });
    expect(second).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(second!);
    expect(mocks.update).toHaveBeenLastCalledWith({ analytics_opt_out: false });
  });

  it('disables the switches while saving', () => {
    mocks.state = prefsState({ show_motivation: true, analytics_opt_out: false }, { saving: true });
    renderWithProviders(<MotivationSection />, { route: '/app/cai-dat' });
    for (const s of screen.getAllByRole('switch')) expect(s).toBeDisabled();
  });

  it('shows a skeleton while loading and the error when saving fails', () => {
    mocks.state = prefsState(null);
    const { unmount } = renderWithProviders(<MotivationSection />, { route: '/app/cai-dat' });
    expect(screen.getByText('Đang tải cài đặt…')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    unmount();

    mocks.state = prefsState({ show_motivation: false, analytics_opt_out: false }, { error: 'Không lưu được cài đặt. Vui lòng thử lại.' });
    renderWithProviders(<MotivationSection />, { route: '/app/cai-dat' });
    expect(screen.getByRole('alert')).toHaveTextContent('Không lưu được cài đặt. Vui lòng thử lại.');
    expect(screen.getByRole('switch', { name: 'Hiện chuỗi ngày, XP và huy hiệu' })).toHaveAttribute('aria-checked', 'false');
  });

  it('explains a load failure', () => {
    mocks.state = { status: 'error', prefs: null, update: mocks.update, saving: false, error: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.' };
    renderWithProviders(<MotivationSection />, { route: '/app/cai-dat' });
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được cài đặt. Không kết nối được máy chủ.');
  });
});
