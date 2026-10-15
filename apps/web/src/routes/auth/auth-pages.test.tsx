import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Navigate, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';
import { renderWithProviders } from '../../../tests/unit/render';
import type { ReactElement } from 'react';
import { AuthCallbackPage } from './AuthCallbackPage';
import { CheckEmailPage } from './CheckEmailPage';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';
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

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

describe('SignInPage', () => {
  it('validates before calling Supabase', async () => {
    at('/dang-nhap', '/dang-nhap', <SignInPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(screen.getByText('Vui lòng nhập email.')).toBeInTheDocument();
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('moves focus to the first invalid field and wires the error to it', async () => {
    at('/dang-nhap', '/dang-nhap', <SignInPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    const email = screen.getByLabelText('Email');
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAttribute('aria-invalid', 'true');
    const describedBy = email.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)).toHaveAttribute('role', 'alert');

    await userEvent.type(email, 'a@b.vn');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() => expect(screen.getByLabelText('Mật khẩu')).toHaveFocus());
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

  it('keeps next on the sign-up link', () => {
    at('/dang-nhap?next=%2Fapp%2Fcai-dat', '/dang-nhap', <SignInPage />);
    expect(screen.getByRole('link', { name: 'Đăng ký miễn phí' })).toHaveAttribute('href', '/dang-ky?next=%2Fapp%2Fcai-dat');
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
  it('shows the password hint, and replaces it with the error once the password is invalid', async () => {
    at('/dang-ky', '/dang-ky', <SignUpPage />);
    expect(screen.getByText('Ít nhất 8 ký tự.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.vn');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    const password = screen.getByLabelText('Mật khẩu');
    await waitFor(() => expect(password).toHaveFocus());
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Ít nhất 8 ký tự.')).not.toBeInTheDocument();
    expect(password.getAttribute('aria-describedby')).toMatch(/-error$/);
    expect(mocks.auth.signUp).not.toHaveBeenCalled();
  });

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

  it('carries next into the confirmation link, the sign-in link and an immediate session', async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u1' } }, error: null });
    at('/dang-ky?next=%2Fapp%2Fcai-dat', '/dang-ky', <SignUpPage />);
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/dang-nhap?next=%2Fapp%2Fcai-dat');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.vn');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'matkhau123');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/kiem-tra-email'));
    expect(mocks.auth.signUp.mock.calls[0]?.[0].options.emailRedirectTo).toBe('http://localhost:5173/auth/callback?next=%2Fapp%2Fcai-dat');
  });

  it('goes to next when sign-up returns a session', async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session: { access_token: 't' }, user: { id: 'u1' } }, error: null });
    at('/dang-ky?next=%2Fapp%2Fcai-dat', '/dang-ky', <SignUpPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.vn');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'matkhau123');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/cai-dat'));
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

describe('ForgotPasswordPage errors', () => {
  async function submit() {
    at('/quen-mat-khau', '/quen-mat-khau', <ForgotPasswordPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.vn');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi liên kết đặt lại' }));
  }

  it('shows a generic error for server failures instead of a false confirmation', async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: null, error: { status: 500, code: 'unexpected_failure' } });
    await submit();
    expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/Nếu email này có tài khoản/)).not.toBeInTheDocument();
  });

  it('shows the rate-limit message for 429', async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: null, error: { status: 429, code: 'over_email_send_rate_limit' } });
    await submit();
    expect(await screen.findByText(/yêu cầu gửi email quá nhiều lần/)).toBeInTheDocument();
  });

  it('stays neutral for other 4xx so accounts cannot be enumerated', async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: null, error: { status: 400, code: 'email_address_invalid' } });
    await submit();
    expect(await screen.findByText(/Nếu email này có tài khoản/)).toBeInTheDocument();
  });
});

describe('AuthCallbackPage', () => {
  it('exchanges the code and redirects', async () => {
    mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    at('/auth/callback?code=abc&next=%2Fapp%2Fcai-dat', '/auth/callback', <AuthCallbackPage />);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/cai-dat'));
    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(sessionStorage.getItem('linguo-recovery')).toBeNull();
  });

  it('flags a recovery session only for the password-reset destination', async () => {
    mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    at('/auth/callback?code=abc&next=%2Fdat-lai-mat-khau', '/auth/callback', <AuthCallbackPage />);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dat-lai-mat-khau'));
    expect(sessionStorage.getItem('linguo-recovery')).toBe('1');
  });

  it('does not flag recovery when the exchange fails', async () => {
    mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: { code: 'flow_state_expired' } });
    at('/auth/callback?code=abc&next=%2Fdat-lai-mat-khau', '/auth/callback', <AuthCallbackPage />);
    expect(await screen.findByText(/Liên kết đã hết hạn/)).toBeInTheDocument();
    expect(sessionStorage.getItem('linguo-recovery')).toBeNull();
  });

  it('offers a new reset link when a password-reset link fails', async () => {
    at('/auth/callback?next=%2Fdat-lai-mat-khau&error=access_denied&error_code=otp_expired', '/auth/callback', <AuthCallbackPage />);
    expect(await screen.findByRole('heading', { name: 'Không mở được liên kết đặt lại mật khẩu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gửi lại liên kết đặt lại' })).toHaveAttribute('href', '/quen-mat-khau');
    expect(screen.getByRole('link', { name: 'Đến trang đăng nhập' })).toHaveAttribute('href', '/dang-nhap');
  });

  it('maps a known provider error code to our own text and never renders error_description', async () => {
    at(
      '/auth/callback?error=access_denied&error_code=otp_expired&error_description=%3Cb%3EInjected%3C%2Fb%3E%20raw%20text',
      '/auth/callback',
      <AuthCallbackPage />,
    );
    expect(await screen.findByRole('heading', { name: 'Không hoàn tất được đăng nhập' })).toBeInTheDocument();
    expect(screen.getByText('Liên kết đã hết hạn. Vui lòng yêu cầu liên kết mới.')).toBeInTheDocument();
    expect(screen.queryByText(/raw text/)).not.toBeInTheDocument();
    expect(mocks.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('falls back to the plain error param, then to a generic message for unknown codes', async () => {
    const first = at('/auth/callback?error=access_denied&error_description=Link%20het%20han', '/auth/callback', <AuthCallbackPage />);
    expect(await screen.findByText(/huỷ hoặc chưa cấp quyền/)).toBeInTheDocument();
    expect(screen.queryByText('Link het han')).not.toBeInTheDocument();
    first.unmount();

    at('/auth/callback?error=weird_thing&error_description=Secret%20detail', '/auth/callback', <AuthCallbackPage />);
    expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('Secret detail')).not.toBeInTheDocument();
    expect(screen.queryByText('weird_thing')).not.toBeInTheDocument();
  });

  describe('errors reported in the URL hash', () => {
    afterEach(() => {
      window.location.hash = '';
    });

    it('maps a hash otp_expired to the expired-link message without rendering error_description', async () => {
      window.location.hash = '#error=access_denied&error_code=otp_expired&error_description=%3Cb%3EInjected%3C%2Fb%3E%20raw%20text';
      at('/auth/callback', '/auth/callback', <AuthCallbackPage />);
      expect(await screen.findByText('Liên kết đã hết hạn. Vui lòng yêu cầu liên kết mới.')).toBeInTheDocument();
      expect(screen.queryByText(/raw text/)).not.toBeInTheDocument();
      expect(mocks.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('shows the generic message for an unknown hash code', async () => {
      window.location.hash = '#error=access_denied&error_code=weird_thing&error_description=Secret%20detail';
      at('/auth/callback', '/auth/callback', <AuthCallbackPage />);
      expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeInTheDocument();
      expect(screen.queryByText('Secret detail')).not.toBeInTheDocument();
      expect(screen.queryByText('weird_thing')).not.toBeInTheDocument();
    });

    it('still redirects to sign-in when there is neither a code nor an error', async () => {
      window.location.hash = '#foo=bar';
      at('/auth/callback', '/auth/callback', <AuthCallbackPage />);
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dang-nhap'));
      expect(mocks.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    });
  });
});

describe('ResetPasswordPage', () => {
  it('redirects ordinary sessions to settings', () => {
    at('/dat-lai-mat-khau', '/dat-lai-mat-khau', <ResetPasswordPage />);
    expect(screen.getByTestId('location')).toHaveTextContent('/app/cai-dat');
    expect(screen.queryByLabelText('Mật khẩu mới')).not.toBeInTheDocument();
  });

  it('shows the form for a recovery session and clears the flag after updating', async () => {
    sessionStorage.setItem('linguo-recovery', '1');
    mocks.auth.updateUser.mockResolvedValue({ data: {}, error: null });
    at('/dat-lai-mat-khau', '/dat-lai-mat-khau', <ResetPasswordPage />);
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'matkhaumoi1');
    await userEvent.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'matkhaumoi1');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app'));
    expect(mocks.auth.updateUser).toHaveBeenCalledWith({ password: 'matkhaumoi1' });
    expect(sessionStorage.getItem('linguo-recovery')).toBeNull();
  });

  it('keeps the flag when the update fails', async () => {
    sessionStorage.setItem('linguo-recovery', '1');
    mocks.auth.updateUser.mockResolvedValue({ data: {}, error: { code: 'same_password' } });
    at('/dat-lai-mat-khau', '/dat-lai-mat-khau', <ResetPasswordPage />);
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'matkhaumoi1');
    await userEvent.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'matkhaumoi1');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));
    expect(await screen.findByText('Mật khẩu mới phải khác mật khẩu cũ.')).toBeInTheDocument();
    expect(sessionStorage.getItem('linguo-recovery')).toBe('1');
  });
});

describe('CheckEmailPage', () => {
  function renderWithEmail(next?: string) {
    return renderWithProviders(
      <Routes>
        <Route path="/" element={<Navigate to="/kiem-tra-email" replace state={{ email: 'a@b.vn', next }} />} />
        <Route path="/kiem-tra-email" element={<CheckEmailPage />} />
      </Routes>,
      signedOut,
    );
  }

  async function waitForResend(next?: string) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithEmail(next);
    // The countdown re-arms a 1s timer after every render, so step it one tick at a time.
    for (let i = 0; i < 60; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    return screen.getByRole('button', { name: 'Gửi lại email' });
  }

  it('recovers from a thrown resend and re-enables the button', async () => {
    const button = await waitForResend();
    mocks.auth.resend.mockRejectedValue(new TypeError('Failed to fetch'));
    await act(async () => {
      button.click();
    });
    expect(await screen.findByText('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi lại email' })).not.toHaveAttribute('aria-busy', 'true');
  });

  it('confirms a successful resend and restarts the cooldown', async () => {
    const button = await waitForResend();
    mocks.auth.resend.mockResolvedValue({ data: {}, error: null });
    await act(async () => {
      button.click();
    });
    expect(await screen.findByText('Đã gửi lại email xác minh.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gửi lại sau \d+s/ })).toBeDisabled();
    expect(mocks.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'a@b.vn',
      options: { emailRedirectTo: 'http://localhost:5173/auth/callback' },
    });
  });

  it('resends a link that leads to the same next as the first one', async () => {
    const button = await waitForResend('/app/cai-dat');
    mocks.auth.resend.mockResolvedValue({ data: {}, error: null });
    await act(async () => {
      button.click();
    });
    await screen.findByText('Đã gửi lại email xác minh.');
    expect(mocks.auth.resend.mock.calls[0]?.[0].options.emailRedirectTo).toBe('http://localhost:5173/auth/callback?next=%2Fapp%2Fcai-dat');
  });
});
