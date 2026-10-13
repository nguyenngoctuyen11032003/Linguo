import { render, screen } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from '@/app/router';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { TEST_USER_ID } from '../../../../tests/unit/render';
import { makeRun, REPORT } from './diagnostic-fixtures';

const mocks = vi.hoisted(() => ({ useDiagnosticRun: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => null,
  requireSupabase: () => ({}),
  authRedirect: (p: string) => p,
}));
vi.mock('@/features/diagnostic/useDiagnosticRun', () => ({
  useDiagnosticRun: mocks.useDiagnosticRun,
}));

const signedIn: AuthState = {
  status: 'signed-in',
  session: null,
  user: { id: TEST_USER_ID } as User,
};

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeProvider>
      <MotionProvider>
        <ToastProvider>
          <AuthContext.Provider value={signedIn}>
            <RouterProvider router={router} />
          </AuthContext.Provider>
        </ToastProvider>
      </MotionProvider>
    </ThemeProvider>,
  );
}

describe('diagnostic routes', () => {
  it('renders the test full screen, outside the app navigation', async () => {
    mocks.useDiagnosticRun.mockReturnValue(makeRun({ status: 'intro', item: null, progress: null }));
    renderAt('/app/kiem-tra/p1');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Kiểm tra trình độ',
      }),
    ).toBeInTheDocument();
    expect(mocks.useDiagnosticRun).toHaveBeenCalledWith('p1', { mode: 'full' });
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).not.toBeInTheDocument();
  });

  it('renders the report full screen, outside the app navigation', async () => {
    mocks.useDiagnosticRun.mockReturnValue(makeRun({ status: 'report', item: null, report: REPORT }));
    renderAt('/app/kiem-tra/p1/ket-qua');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Kết quả kiểm tra',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).not.toBeInTheDocument();
  });
});
