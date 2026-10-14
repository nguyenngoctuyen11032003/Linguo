import { render, screen } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from '@/app/router';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { examAttempt } from '@/features/exam/exam-fixtures';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { TEST_USER_ID } from '../../../../tests/unit/render';

const mocks = vi.hoisted(() => ({ useExamAttempt: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => null, requireSupabase: () => ({}), authRedirect: (p: string) => p }));
vi.mock('@/features/exam/useExamAttempt', () => ({ useExamAttempt: mocks.useExamAttempt }));
vi.mock('@/features/exam/tts', () => ({ canSpeak: () => false, onVoicesChanged: () => () => {}, speak: vi.fn(), stopSpeaking: vi.fn() }));

const signedIn: AuthState = { status: 'signed-in', session: null, user: { id: TEST_USER_ID } as User };

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
  return router;
}

describe('exam routes', () => {
  it('renders the hub inside the app layout instead of the coming soon page', async () => {
    renderAt('/app/luyen-thi');
    expect(await screen.findByRole('heading', { level: 1, name: 'Luyện thi' })).toBeInTheDocument();
    expect(screen.queryByText('Sắp ra mắt')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
  });

  it('renders the runner full screen, outside the app navigation', async () => {
    mocks.useExamAttempt.mockReturnValue({
      status: 'running',
      attempt: examAttempt(),
      result: null,
      error: null,
      remainingMs: 1000,
      saveState: 'idle',
      setAnswer: vi.fn(),
      toggleFlag: vi.fn(),
      submit: vi.fn(),
    });
    renderAt('/app/luyen-thi/lam-bai/abc');
    expect(await screen.findByRole('heading', { level: 1, name: 'TOPIK II — Đề mini số 1' })).toBeInTheDocument();
    expect(mocks.useExamAttempt).toHaveBeenCalledWith('abc');
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).not.toBeInTheDocument();
  });

  it('renders the result page full screen', async () => {
    renderAt('/app/luyen-thi/ket-qua/abc');
    expect(await screen.findByRole('heading', { level: 1, name: 'Kết quả bài luyện' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).not.toBeInTheDocument();
  });
});
