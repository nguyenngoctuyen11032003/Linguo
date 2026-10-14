import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { publishNotificationsChanged } from '@/features/notifications/events';
import { markNotification } from '@/features/notifications/service';
import { onNotificationClicked, UpdateToast } from '@/features/pwa';
import { appPathFrom } from '@/features/pwa/app-path';
import { getSupabase } from '@/lib/supabase';

/**
 * Spec 10 §4–5 glue inside the router: the "Đã có phiên bản mới" toast and the SW → app notification-click
 * message (mark the notification clicked, refresh the bell, and route there when the SW could not navigate).
 */
export function PwaBridge() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(
    () =>
      onNotificationClicked(({ notificationId, url, navigated }) => {
        const client = getSupabase();
        if (notificationId && client) {
          markNotification(client, notificationId, 'clicked')
            .then(publishNotificationsChanged)
            .catch(() => undefined);
        }
        if (!navigated) void navigate(appPathFrom(url));
      }),
    [navigate],
  );

  return <UpdateToast pathname={pathname} />;
}
