import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TEST_USER_ID } from '../../../tests/unit/render';
import { SettingsPage } from './SettingsPage';

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  updatePreferences: vi.fn(),
  signOut: vi.fn(),
}));
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
});
