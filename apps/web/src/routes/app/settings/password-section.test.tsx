import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TEST_USER_ID } from '../../../../tests/unit/render';
import { hasPasswordSignIn } from '@/features/auth/password-change';
import { PasswordSection } from './PasswordSection';
import { resetSectionStateForTests, setSectionOpen } from './section-state';

const mocks = vi.hoisted(() => ({ signInWithPassword: vi.fn(), updateUser: vi.fn() }));

vi.mock('@/lib/supabase', () => {
  const client = { auth: { signInWithPassword: mocks.signInWithPassword, updateUser: mocks.updateUser } };
  return { getSupabase: () => client, requireSupabase: () => client };
});

const EMAIL_USER = {
  id: TEST_USER_ID,
  email: 'minhanh@example.com',
  app_metadata: { provider: 'email', providers: ['email'] },
} as unknown as User;
const GOOGLE_USER = {
  id: TEST_USER_ID,
  email: 'minhanh@gmail.com',
  app_metadata: { provider: 'google', providers: ['google'] },
} as unknown as User;

beforeEach(() => {
  resetSectionStateForTests();
  setSectionOpen('mat-khau', true);
  mocks.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
});

function render(user: User = EMAIL_USER) {
  return renderWithProviders(<PasswordSection />, { route: '/app/cai-dat', auth: { user } });
}

/** Pastes rather than types each value: one input event per field keeps the test fast under load. */
async function enter(label: string, value: string) {
  if (!value) return;
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.paste(value);
}

async function fill(current: string, password: string, confirm = password) {
  await enter('Mật khẩu hiện tại', current);
  await enter('Mật khẩu mới', password);
  await enter('Nhập lại mật khẩu mới', confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
}

describe('hasPasswordSignIn', () => {
  it('needs an email identity', () => {
    expect(hasPasswordSignIn(EMAIL_USER)).toBe(true);
    expect(hasPasswordSignIn(GOOGLE_USER)).toBe(false);
    expect(hasPasswordSignIn({ ...GOOGLE_USER, app_metadata: { provider: 'google', providers: ['google', 'email'] } } as User)).toBe(true);
    expect(hasPasswordSignIn({ id: 'x', app_metadata: {}, identities: [{ provider: 'google' }] } as unknown as User)).toBe(false);
    expect(hasPasswordSignIn(null)).toBe(false);
  });
});

describe('PasswordSection', () => {
  it('verifies the current password, sets the new one, toasts and clears the fields', async () => {
    render();
    expect(screen.getByRole('heading', { level: 2, name: 'Mật khẩu' })).toBeInTheDocument();
    await fill('old-secret', 'new-secret-1');
    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'new-secret-1' }));
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'minhanh@example.com', password: 'old-secret' });
    expect(mocks.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUser.mock.invocationCallOrder[0]!);
    expect(await screen.findByText('Đã đổi mật khẩu.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toHaveValue('');
    expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('');
    expect(screen.getByLabelText('Nhập lại mật khẩu mới')).toHaveValue('');
  });

  it('applies the sign-up rules and focuses the first invalid field', async () => {
    render();
    await fill('', 'short', 'short');
    expect(screen.getByText('Vui lòng nhập mật khẩu hiện tại.')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Mật khẩu cần ít nhất 8 ký tự.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Mật khẩu hiện tại')).toHaveFocus());
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects a mismatched confirmation and a new password equal to the current one', async () => {
    render();
    await fill('old-secret', 'new-secret-1', 'new-secret-2');
    expect(screen.getByText('Mật khẩu nhập lại không khớp.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Nhập lại mật khẩu mới')).toHaveFocus());
    await userEvent.clear(screen.getByLabelText('Mật khẩu mới'));
    await userEvent.clear(screen.getByLabelText('Nhập lại mật khẩu mới'));
    await fill('', 'old-secret');
    expect(screen.getByText('Mật khẩu mới phải khác mật khẩu hiện tại.')).toBeInTheDocument();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('flags a wrong current password on its field and does not update', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { name: 'AuthApiError', code: 'invalid_credentials', status: 400 } });
    render();
    await fill('wrong-pass', 'new-secret-1');
    expect(await screen.findByText('Mật khẩu hiện tại không đúng.')).toHaveAttribute('role', 'alert');
    await waitFor(() => expect(screen.getByLabelText('Mật khẩu hiện tại')).toHaveFocus());
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ['same_password', 'Mật khẩu mới phải khác mật khẩu cũ.'],
    ['weak_password', 'Mật khẩu chưa đủ mạnh. Dùng ít nhất 8 ký tự.'],
    ['over_request_rate_limit', 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.'],
  ])('reports %s from the update in Vietnamese', async (code, message) => {
    mocks.updateUser.mockResolvedValue({ data: {}, error: { name: 'AuthApiError', code, status: 422 } });
    render();
    await fill('old-secret', 'new-secret-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('new-secret-1');
  });

  it('reports a rate-limited re-authentication and a network failure', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { name: 'AuthApiError', code: 'over_request_rate_limit', status: 429 } });
    render();
    await fill('old-secret', 'new-secret-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.');
    mocks.signInWithPassword.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.'));
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('hides the form for a Google-only account', () => {
    render(GOOGLE_USER);
    expect(screen.getByText(/đăng nhập bằng Google/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Mật khẩu hiện tại')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đổi mật khẩu' })).not.toBeInTheDocument();
  });
});
