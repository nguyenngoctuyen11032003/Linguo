import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { MemoryRouter, useLocation } from 'react-router';
import { vi } from 'vitest';
import { DEFAULT_TIMEZONE } from '@linguo/shared';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { LearningPathsContext, type LearningPathsContextValue } from '@/features/learning-paths/LearningPathsProvider';
import { ProfileContext, type ProfileContextValue } from '@/features/profile/ProfileProvider';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { TEST_PATH } from './learning-fixtures';

export const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

interface Options {
  route?: string;
  auth?: Partial<AuthState>;
  profile?: Partial<ProfileContextValue>;
  paths?: Partial<LearningPathsContextValue>;
}

/** Renders `ui` inside every app provider with a signed-in user who has one EN path by default. */
export function renderWithProviders(ui: ReactElement, { route = '/', auth, profile, paths }: Options = {}) {
  const authValue: AuthState = {
    status: 'signed-in',
    session: null,
    user: { id: TEST_USER_ID, email: 'minhanh@example.com' } as User,
    ...auth,
  };
  const profileValue: ProfileContextValue = {
    status: 'ready',
    profile: { id: TEST_USER_ID, displayName: 'Minh Anh', timezone: DEFAULT_TIMEZONE },
    error: null,
    reload: vi.fn(),
    setProfile: vi.fn(),
    ...profile,
  };
  const pathList = paths?.paths ?? [TEST_PATH];
  const currentId = paths?.currentId !== undefined ? paths.currentId : (pathList[0]?.id ?? null);
  const pathsValue: LearningPathsContextValue = {
    status: 'ready',
    error: null,
    reload: vi.fn(),
    setCurrent: vi.fn().mockResolvedValue(undefined),
    upsertPath: vi.fn(),
    ...paths,
    paths: pathList,
    currentId,
    current: paths?.current !== undefined ? paths.current : (pathList.find((p) => p.id === currentId) ?? null),
  };
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <MotionProvider>
          <ToastProvider>
            <AuthContext.Provider value={authValue}>
              <ProfileContext.Provider value={profileValue}>
                <LearningPathsContext.Provider value={pathsValue}>
                  {ui}
                  <LocationProbe />
                </LearningPathsContext.Provider>
              </ProfileContext.Provider>
            </AuthContext.Provider>
          </ToastProvider>
        </MotionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}
