import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { subscribeMotivationPrefs } from '@/features/progress/prefs-events';
import { getSupabase } from '@/lib/supabase';
import { configureAnalytics, flushAnalytics, setAnalyticsRoute } from './client';

/**
 * Wires the analytics queue to the signed-in user: enabled as soon as a user is known (track_events itself stores
 * nothing for an opted-out user), then disabled if `analytics_opt_out` turns out to be set. Flushes when the page
 * is hidden or unloaded.
 */
export function AnalyticsProvider({ children }: { children: ReactNode }): ReactNode {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();

  // Layout effect: configured before any child's passive effect (RouteTracker's first page_view) runs.
  useLayoutEffect(() => {
    if (!userId || !client) {
      configureAnalytics({ client: null, enabled: false });
      return;
    }
    configureAnalytics({ client, enabled: true });
    return () => {
      configureAnalytics({ client: null, enabled: false });
      setAnalyticsRoute(null);
    };
  }, [client, userId]);

  useEffect(() => {
    if (!userId || !client) return;
    let active = true;
    // Lazy: keeps the progress contract (zod schemas) out of the entry chunk.
    import('@/features/progress/service')
      .then((m) => m.getMotivationPrefs(client, userId))
      .then((prefs) => {
        if (active && prefs.analytics_opt_out) configureAnalytics({ client, enabled: false });
      })
      .catch(() => {
        // Unknown preference: keep sending, the server still drops events of an opted-out user.
      });
    const unsubscribe = subscribeMotivationPrefs((changedUser, prefs) => {
      if (changedUser === userId) configureAnalytics({ client, enabled: !prefs.analytics_opt_out });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client, userId]);

  useEffect(() => {
    const onPageHide = () => void flushAnalytics();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flushAnalytics();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <>{children}</>;
}
