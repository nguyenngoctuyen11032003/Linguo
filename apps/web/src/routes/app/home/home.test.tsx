import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TEST_KO_PATH, TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { HomePage } from '../HomePage';
import { needsSpreadWarning } from './SpreadWarning';

const mocks = vi.hoisted(() => ({ setPathStatus: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/learning-paths/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/learning-paths/service')>()),
  setPathStatus: mocks.setPathStatus,
}));

describe('HomePage', () => {
  it('greets and summarises the current path without fake progress', () => {
    renderWithProviders(<HomePage />, { route: '/app' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chào Minh Anh');
    expect(screen.getByText('Lộ trình của bạn')).toBeInTheDocument();
    expect(screen.getByText('A2 → B1')).toBeInTheDocument();
    expect(screen.getByText('Khoảng 43–69 tuần')).toBeInTheDocument();
    expect(screen.getByText('Chưa đủ dữ liệu (tự đánh giá)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bắt đầu phiên học' })).toBeDisabled();
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

  it('redirects to onboarding only when the list loaded empty', () => {
    const { unmount } = renderWithProviders(<HomePage />, { route: '/app', paths: { status: 'loading', paths: [] } });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/);
    unmount();
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [] } });
    expect(screen.getByTestId('location')).toHaveTextContent('/app/bat-dau');
  });

  it('shows an error with retry', async () => {
    const reload = vi.fn();
    renderWithProviders(<HomePage />, { route: '/app', paths: { status: 'error', paths: [], reload } });
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(reload).toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/);
  });

  it('resumes a paused path', async () => {
    const upsertPath = vi.fn();
    mocks.setPathStatus.mockResolvedValue({ ...TEST_PATH, status: 'active' });
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [{ ...TEST_PATH, status: 'paused' }], upsertPath } });
    expect(screen.getByText('Đang tạm dừng')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục lộ trình' }));
    expect(mocks.setPathStatus).toHaveBeenCalledWith({}, 'path-en', 'active');
    expect(upsertPath).toHaveBeenCalledWith({ ...TEST_PATH, status: 'active' });
  });

  it('warns when two languages share too little time', () => {
    const low = (p: typeof TEST_PATH) => ({ ...p, weeklyMinutes: [10, 10, 10, 10, 10, 10, 10] });
    expect(needsSpreadWarning([low(TEST_PATH), low(TEST_KO_PATH)])).toBe(true);
    expect(needsSpreadWarning([TEST_PATH, low(TEST_KO_PATH)])).toBe(false);
    renderWithProviders(<HomePage />, { route: '/app', paths: { paths: [low(TEST_PATH), low(TEST_KO_PATH)] } });
    expect(screen.getByRole('note')).toHaveTextContent('Bạn đang học 2 ngôn ngữ');
  });
});
