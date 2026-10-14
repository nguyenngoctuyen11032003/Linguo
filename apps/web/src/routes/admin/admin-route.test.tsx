import { render, screen } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ADMIN_CHILD_PATHS, routes } from '@/app/router';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { TEST_USER_ID } from '../../../tests/unit/render';
import { adminRoutes } from './admin-routes';

// No Supabase client: staff_role() resolves to null, as for every learner.
vi.mock('@/lib/supabase', () => ({ getSupabase: () => null, requireSupabase: () => ({}), authRedirect: (p: string) => p }));

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
}

describe('admin route mount', () => {
  it('lists exactly the child paths of adminRoutes, so every lazy child resolves an element', () => {
    expect(adminRoutes.map((r) => (r.index ? null : r.path))).toEqual([...ADMIN_CHILD_PATHS]);
    expect(adminRoutes.every((r) => r.element)).toBe(true);
  });

  it.each(['/quan-tri', '/quan-tri/bao-loi'])('shows the ordinary 404 page to a learner at %s', async (path) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy trang' })).toBeInTheDocument();
    expect(screen.queryByText('Quản trị')).not.toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});
