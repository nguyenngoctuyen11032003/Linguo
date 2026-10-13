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
import { makeRun } from './lesson-fixtures';

const mocks = vi.hoisted(() => ({ useLessonRun: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => null, requireSupabase: () => ({}), authRedirect: (p: string) => p }));
vi.mock('@/features/lesson-player/useLessonRun', () => ({ useLessonRun: mocks.useLessonRun }));
vi.mock('@/features/lesson-player/usePathLessons', () => ({
  usePathLessons: () => ({ status: 'ready', lessons: [], error: null, reload: () => {} }),
}));
vi.mock('@/components/exercise', () => ({
  DemoBadge: () => <span>Nội dung demo — chưa kiểm duyệt</span>,
  PendingSyncBadge: () => null,
  ExerciseFrame: () => null,
}));

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

describe('lesson routes', () => {
  it('renders the lesson player full screen, outside the app navigation', async () => {
    mocks.useLessonRun.mockReturnValue(makeRun());
    renderAt('/app/hoc-tap/bai/x');
    expect(await screen.findByRole('heading', { level: 1, name: 'Chào hỏi cơ bản' })).toBeInTheDocument();
    expect(mocks.useLessonRun).toHaveBeenCalledWith('x');
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).not.toBeInTheDocument();
  });

  it('renders the Learn page inside the app layout', async () => {
    renderAt('/app/hoc-tap');
    expect(await screen.findByRole('heading', { level: 1, name: 'Học tập' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
  });
});
