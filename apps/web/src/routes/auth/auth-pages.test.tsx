import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../tests/unit/render';
import type { ReactElement } from 'react';
import { AuthCallbackPage } from './AuthCallbackPage';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { SignInPage } from './SignInPage';
import { SignUpPage } from './SignUpPage';

const mocks = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    resend: vi.fn(),
    updateUser: vi.fn(),
    signInWithOAuth: vi.fn(),
  },
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: mocks.auth }),
  requireSupabase: () => ({ auth: mocks.auth }),
  authRedirect: (path: string) => `http://localhost:5173${path}`,
}));

const signedOut = { auth: { status: 'signed-out' as const, session: null, user: null } };

function at(route: string, path: string, element: ReactElement) {
  return renderWithProviders(
    <Routes>
      <Route path={path} element={element} />
      <Route path="*" element={null} />
    </Routes>,
    { route, ...signedOut },
  );
}

beforeEach(() => {
  for (const fn of Object.values(mocks.auth)) fn.mockReset();
});

describe('SignInPage', () => {
  it('validates before calling Supabase', async () => {
    at('/dang-nhap', '/dang-nhap', <SignInPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(screen.getByText('Vui lòng nhập email.')).toBeInTheDocument();
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in and goes to the safe next path', async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    at('/dang-nhap?next=%2Fapp%2Fcai-dat', '/dang-nhap', <SignInPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.vn');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'matkhau123');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/cai-dat'));
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.vn', password: 'matkhau123' });
  });

  it('shows a Vietnamese error on bad credentials', async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } });
    at('/dang-nhap', '/dang-nhap', <SignInPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.vn');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'sai');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Email hoặc mật khẩu không đúng.')).toBeInTheDocument();
  });
});

describe('SignUpPage', () => {
  it('sends the display name and goes to the check-email screen', async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u1' } }, error: null });
    at('/dang-ky', '/dang-ky', <SignUpPage />);
    await userEvent.type(screen.getByLabelText('Tên hiển thị (không bắt buộc)'), 'Minh Anh');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.vn');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'matkhau123');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/kiem-tra-email'));
    expect(mocks.auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.vn',
      password: 'matkhau123',
      options: { emailRedirectTo: 'http://localhost:5173/auth/callback', data: { display_name: 'Minh Anh' } },
    });
  });
});

describe('ForgotPasswordPage', () => {
  it('always shows a neutral confirmation', async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    at('/quen-mat-khau', '/quen-mat-khau', <ForgotPasswordPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.vn');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi liên kết đặt lại' }));
    expect(await screen.findByText(/Nếu email này có tài khoản/)).toBeInTheDocument();
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.vn', {
      redirectTo: 'http://localhost:5173/auth/callback?next=%2Fdat-lai-mat-khau',
    });
  });
});

describe('AuthCallbackPage', () => {
  it('exchanges the code and redirects', async () => {
    mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    at('/auth/callback?code=abc&next=%2Fdat-lai-mat-khau', '/auth/callback', <AuthCallbackPage />);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dat-lai-mat-khau'));
    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('shows provider errors', async () => {
    at('/auth/callback?error=access_denied&error_description=Link%20het%20han', '/auth/callback', <AuthCallbackPage />);
    expect(await screen.findByRole('heading', { name: 'Không hoàn tất được đăng nhập' })).toBeInTheDocument();
    expect(screen.getByText('Link het han')).toBeInTheDocument();
  });
});
