import { Outlet } from 'react-router';
import { RequireAuth } from '@/features/auth/guards';
import { LearningPathsProvider } from '@/features/learning-paths/LearningPathsProvider';
import { ProfileProvider } from '@/features/profile/ProfileProvider';

/** Everything under /app: signed-in user, profile and learning paths loaded once for all screens. */
export function AppRoute() {
  return (
    <RequireAuth>
      <ProfileProvider>
        <LearningPathsProvider>
          <Outlet />
        </LearningPathsProvider>
      </ProfileProvider>
    </RequireAuth>
  );
}
