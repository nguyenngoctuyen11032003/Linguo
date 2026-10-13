import { Outlet } from 'react-router';
import { RequireAuth } from '@/features/auth/guards';
import { LearningPathsProvider } from '@/features/learning-paths/LearningPathsProvider';
import { OutboxSyncProvider } from '@/features/lesson-player/OutboxSyncProvider';
import { ProfileProvider } from '@/features/profile/ProfileProvider';

/**
 * Everything under /app: signed-in user, profile and learning paths loaded once for all screens, and the offline
 * outbox of lesson answers replayed whichever screen is open.
 */
export function AppRoute() {
  return (
    <RequireAuth>
      <OutboxSyncProvider>
        <ProfileProvider>
          <LearningPathsProvider>
            <Outlet />
          </LearningPathsProvider>
        </ProfileProvider>
      </OutboxSyncProvider>
    </RequireAuth>
  );
}
