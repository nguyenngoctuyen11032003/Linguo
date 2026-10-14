import { Outlet } from 'react-router';
import { RouteTracker } from '@/features/analytics';
import { RequireAuth } from '@/features/auth/guards';
import { LearningPathsProvider } from '@/features/learning-paths/LearningPathsProvider';
import { OutboxSyncProvider } from '@/features/lesson-player/OutboxSyncProvider';
import { ProfileProvider } from '@/features/profile/ProfileProvider';

/**
 * Everything under /app: signed-in user, profile and learning paths loaded once for all screens, and the offline
 * outbox of lesson answers replayed whichever screen is open, and one `page_view` per route pattern (including the
 * full-screen lesson and placement test, which sit outside AppLayout).
 */
export function AppRoute() {
  return (
    <RequireAuth>
      <RouteTracker />
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
