import { act, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/lib/supabase';
import { AuthContext, AuthProvider, useAuth, type AuthState } from './AuthProvider';
import { authErrorMessage } from './error-map';
import { RedirectIfAuthed, RequireAuth } from './guards';
import { safeNext } from './safe-next';

describe('authErrorMessage', () => {
  it('maps known Supabase codes to Vietnamese', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe('Email hoặc mật khẩu không đúng.');
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 })).toBe(
      'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
    );
    expect(authErrorMessage({ name: 'AuthPKCECodeVerifierMissingError' })).toMatch(/cùng trình duyệt/);
    expect(authErrorMessage({ code: 'something_new' })).toBe('Đã có lỗi xảy ra (mã: something_new). Vui lòng thử lại.');
    expect(authErrorMessage(undefined)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});

describe('safeNext', () => {
  it('only allows internal paths', () => {
    expect(safeNext('/app/cai-dat')).toBe('/app/cai-dat');
    expect(safeNext('https://evil.com')).toBe('/app');
    expect(safeNext('//evil.com')).toBe('/app');
    expect(safeNext('/\\evil.com')).toBe('/app');
    expect(safeNext(null)).toBe('/app');
  });
});

describe('AuthProvider', () => {
  it('moves from loading to signed-in and reacts to auth changes', async () => {
    let listener: ((event: string, session: Session | null) => void) | undefined;
    const session = { user: { id: 'u1', email: 'a@b.vn' } } as unknown as Session;
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session } }),
        onAuthStateChange: vi.fn((cb) => {
          listener = cb;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
    } as unknown as AppSupabaseClient;

    function Probe() {
      const auth = useAuth();
      return <span data-testid="status">{`${auth.status}:${auth.user?.id ?? '-'}`}</span>;
    }
    render(
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId('status')).toHaveTextContent('loading:-');
    expect(await screen.findByText('signed-in:u1')).toBeInTheDocument();
    act(() => listener?.('SIGNED_OUT', null));
    expect(screen.getByTestId('status')).toHaveTextContent('signed-out:-');
  });

  it('is "unconfigured" without a client', () => {
    function Probe() {
      return <span>{useAuth().status}</span>;
    }
    render(
      <AuthProvider client={null}>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('unconfigured')).toBeInTheDocument();
  });
});

function renderGuarded(state: AuthState, entry: string) {
  return render(
    <AuthContext.Provider value={state}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/app" element={<RequireAuth><p>Khu vực học</p></RequireAuth>} />
          <Route path="/dang-nhap" element={<RedirectIfAuthed><p>Trang đăng nhập</p></RedirectIfAuthed>} />
          <Route path="/app/cai-dat" element={<p>Cài đặt</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('guards', () => {
  const signedOut: AuthState = { status: 'signed-out', session: null, user: null };
  const signedIn = { status: 'signed-in', session: null, user: { id: 'u1' } } as unknown as AuthState;

  it('RequireAuth sends signed-out users to sign in', () => {
    renderGuarded(signedOut, '/app');
    expect(screen.getByText('Trang đăng nhập')).toBeInTheDocument();
  });

  it('RedirectIfAuthed sends signed-in users to a safe next', () => {
    renderGuarded(signedIn, '/dang-nhap?next=%2Fapp%2Fcai-dat');
    expect(screen.getByText('Cài đặt')).toBeInTheDocument();
  });

  it('shows the not-configured screen', () => {
    renderGuarded({ status: 'unconfigured', session: null, user: null }, '/app');
    expect(screen.getByRole('heading', { name: 'Chưa cấu hình Supabase' })).toBeInTheDocument();
  });
});
