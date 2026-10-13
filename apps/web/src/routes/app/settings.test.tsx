import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubMatchMedia } from '../../../tests/unit/match-media';
import { renderWithProviders, TEST_USER_ID } from '../../../tests/unit/render';
import { SettingsPage } from './SettingsPage';

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  updatePreferences: vi.fn(),
  signOut: vi.fn(),
}));

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
vi.mock('@/features/profile/service', () => ({ updateProfile: mocks.updateProfile }));
vi.mock('@/features/preferences/service', () => ({ updatePreferences: mocks.updatePreferences }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signOut: mocks.signOut } }),
  requireSupabase: () => ({ auth: { signOut: mocks.signOut } }),
}));

beforeEach(() => {
  mocks.updateProfile.mockReset().mockResolvedValue(undefined);
  mocks.updatePreferences.mockReset().mockResolvedValue(undefined);
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
});

describe('SettingsPage', () => {
  it('pre-fills the profile and saves a trimmed display name', async () => {
    const setProfile = vi.fn();
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat', profile: { setProfile } });
    const name = screen.getByLabelText('Tên hiển thị');
    expect(name).toHaveValue('Minh Anh');
    await userEvent.clear(name);
    await userEvent.type(name, '  An  ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith(expect.anything(), TEST_USER_ID, { displayName: 'An', timezone: 'Asia/Ho_Chi_Minh' }),
    );
    expect(setProfile).toHaveBeenCalledWith({ id: TEST_USER_ID, displayName: 'An', timezone: 'Asia/Ho_Chi_Minh' });
    expect(await screen.findByText('Đã lưu hồ sơ.')).toBeInTheDocument();
  });

  it('rejects names longer than 60 characters', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    const name = screen.getByLabelText('Tên hiển thị');
    await userEvent.clear(name);
    await userEvent.type(name, 'a'.repeat(61));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    expect(screen.getByText('Tên hiển thị tối đa 60 ký tự.')).toBeInTheDocument();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('applies the theme immediately and persists it', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await waitFor(() =>
      expect(mocks.updatePreferences).toHaveBeenCalledWith(expect.anything(), TEST_USER_ID, { theme: 'dark', reduceMotion: false }),
    );
  });

  it('toggles reduced motion', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    const toggle = screen.getByRole('switch', { name: 'Giảm chuyển động' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
  });

  it('signs out and returns to the landing page', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it('falls back to a local sign-out when the server call fails, then leaves', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: { status: 0 } }).mockResolvedValueOnce({ error: null });
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(mocks.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(screen.getByText('Không đăng xuất được trên máy chủ, đã xoá phiên trên thiết bị này.')).toBeInTheDocument();
  });

  it('stays on the page when even the local sign-out fails', async () => {
    mocks.signOut.mockResolvedValue({ error: { status: 0 } });
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByText('Không đăng xuất được. Vui lòng thử lại.')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/cai-dat');
  });

  it('shows an error, not "saved", when the profile update touched no rows', async () => {
    mocks.updateProfile.mockRejectedValue(new Error('NO_ROWS_UPDATED'));
    const setProfile = vi.fn();
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat', profile: { setProfile } });
    const name = screen.getByLabelText('Tên hiển thị');
    await userEvent.clear(name);
    await userEvent.type(name, 'An');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    expect(await screen.findByText('Chưa lưu được hồ sơ. Kiểm tra mạng rồi thử lại.')).toBeInTheDocument();
    expect(screen.queryByText('Đã lưu hồ sơ.')).not.toBeInTheDocument();
    expect(setProfile).not.toHaveBeenCalled();
    expect(name).toHaveValue('An');
  });

  it('does not save without a signed-in user', async () => {
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat', auth: { status: 'signed-out', session: null, user: null } });
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('serialises preference writes, latest wins, and ignores errors from superseded writes', async () => {
    const first = deferred();
    mocks.updatePreferences.mockReset().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    await waitFor(() => expect(mocks.updatePreferences).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('radio', { name: 'Sáng' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Giảm chuyển động' }));
    // The newer writes wait for the in-flight one instead of racing it.
    expect(mocks.updatePreferences).toHaveBeenCalledTimes(1);
    first.reject(new Error('stale failure'));
    await waitFor(() => expect(mocks.updatePreferences).toHaveBeenCalledTimes(2));
    expect(mocks.updatePreferences).toHaveBeenLastCalledWith(expect.anything(), TEST_USER_ID, { theme: 'light', reduceMotion: true });
    expect(screen.queryByText(/Chưa đồng bộ được tuỳ chọn/)).not.toBeInTheDocument();
  });

  it('reports a failed latest preference write', async () => {
    mocks.updatePreferences.mockRejectedValue(new Error('NO_ROWS_UPDATED'));
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(await screen.findByText(/Chưa đồng bộ được tuỳ chọn/)).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('exposes the theme as a native radio group that follows arrow keys', async () => {
    localStorage.setItem('lp-theme', 'light');
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    expect(screen.getByRole('group', { name: 'Chủ đề màu' })).toBeInTheDocument();
    const light = screen.getByRole('radio', { name: 'Sáng' });
    expect(light).toBeChecked();
    expect(light).toHaveAttribute('type', 'radio');
    await userEvent.click(light);
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Tối' })).toBeChecked();
  });

  it('explains when the operating system forces reduced motion', () => {
    stubMatchMedia((q) => q.includes('prefers-reduced-motion'));
    renderWithProviders(<SettingsPage />, { route: '/app/cai-dat' });
    expect(screen.getByText('Hệ điều hành đang bật giảm chuyển động.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Giảm chuyển động' })).toHaveAttribute('aria-checked', 'false');
  });
});
