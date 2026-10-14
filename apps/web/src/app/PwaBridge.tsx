import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { publishNotificationsChanged } from '@/features/notifications/events';
import { markNotification } from '@/features/notifications/service';
import { isBusyRoute, onNotificationClicked, UpdateToast } from '@/features/pwa';
import { appPathFrom } from '@/features/pwa/app-path';
import { NotificationOpenToast } from '@/features/pwa/NotificationOpenToast';
import { getSupabase } from '@/lib/supabase';

/**
 * Spec 10 §4–5 glue inside the router: the "Đã có phiên bản mới" toast and the SW → app notification-click
 * message. A click is always marked 'clicked' first (the reminder backoff depends on it, whatever happens to the
 * page). The service worker never navigates an open window, so the app routes to the target itself: at once on an
 * ordinary page, but on a lesson/exam/session route only after the learner taps "Mở" in a toast (nothing ever
 * interrupts a lesson).
 */
export function PwaBridge() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const pathnameRef = useRef(pathname);
  const [waiting, setWaiting] = useState<string | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(
    () =>
      onNotificationClicked(({ notificationId, url, navigated }) => {
        const client = getSupabase();
        if (notificationId && client) {
          markNotification(client, notificationId, 'clicked')
            .then(publishNotificationsChanged)
            .catch(() => undefined);
        }
        if (navigated) return;
        const target = appPathFrom(url);
        if (isBusyRoute(pathnameRef.current)) setWaiting(target);
        else void navigate(target);
      }),
    [navigate],
  );

  const open = useCallback(() => {
    if (waiting) void navigate(waiting);
    setWaiting(null);
  }, [navigate, waiting]);
  const dismiss = useCallback(() => setWaiting(null), []);

  return (
    <>
      <UpdateToast pathname={pathname} />
      <NotificationOpenToast open={waiting !== null} onOpen={open} onDismiss={dismiss} />
    </>
  );
}
