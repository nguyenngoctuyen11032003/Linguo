import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { MemoryRouter, useLocation } from 'react-router';
import { vi } from 'vitest';
import { DEFAULT_TIMEZONE } from '@linguo/shared';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthContext, type AuthState } from '@/features/auth/AuthProvider';
import { ProfileContext, type ProfileContextValue } from '@/features/profile/ProfileProvider';
import { MotionProvider } from '@/providers/MotionProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';

export const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

interface Options {
  route?: string;
  auth?: Partial<AuthState>;
  profile?: Partial<ProfileContextValue>;
}

/** Renders `ui` inside every app provider with a signed-in user by default. */
export function renderWithProviders(ui: ReactElement, { route = '/', auth, profile }: Options = {}) {
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
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <MotionProvider>
          <ToastProvider>
            <AuthContext.Provider value={authValue}>
              <ProfileContext.Provider value={profileValue}>
                {ui}
                <LocationProbe />
              </ProfileContext.Provider>
            </AuthContext.Provider>
          </ToastProvider>
        </MotionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}
