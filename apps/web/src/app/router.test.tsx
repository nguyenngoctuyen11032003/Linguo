import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { routes } from './router';

vi.mock('@/lib/supabase', () => ({ getSupabase: () => null, requireSupabase: () => ({}), authRedirect: (p: string) => p }));

function renderAt(path: string, auth: AuthState) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeProvider>
      <MotionProvider>
        <ToastProvider>
          <AuthContext.Provider value={auth}>
            <RouterProvider router={router} />
          </AuthContext.Provider>
        </ToastProvider>
      </MotionProvider>
    </ThemeProvider>,
  );
  return router;
}

const signedOut: AuthState = { status: 'signed-out', session: null, user: null };

describe('routes', () => {
  it('redirects /app to sign in when signed out', async () => {
    localStorage.setItem('linguo-reduce-motion', 'true');
    const router = renderAt('/app/cai-dat', signedOut);
    expect(await screen.findByRole('heading', { name: 'Chào mừng trở lại' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dang-nhap');
    expect(router.state.location.search).toBe('?next=%2Fapp%2Fcai-dat');
  });

  it('shows 404 for unknown paths', async () => {
    renderAt('/khong-ton-tai', signedOut);
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
  });

  it('renders the public legal pages', async () => {
    renderAt('/quyen-rieng-tu', signedOut);
    expect(await screen.findByRole('heading', { level: 1, name: 'Quyền riêng tư' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gia sư AI và Gemini' })).toBeInTheDocument();
  });

  it('renders the terms page', async () => {
    renderAt('/dieu-khoan', signedOut);
    expect(await screen.findByRole('heading', { level: 1, name: 'Điều khoản sử dụng' })).toBeInTheDocument();
  });
});

describe('route error boundaries', () => {
  it('gives every route its own errorElement', () => {
    const missing: string[] = [];
    const visit = (list: typeof routes, trail: string) => {
      for (const route of list) {
        const name = `${trail}/${route.path ?? (route.index ? '(index)' : '(layout)')}`;
        if (!route.errorElement) missing.push(name);
        if (route.children) visit(route.children, name);
      }
    };
    visit(routes, '');
    expect(missing).toEqual([]);
  });
});
