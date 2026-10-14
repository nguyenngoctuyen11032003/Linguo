import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { notificationErrorMessage } from './error-map';
import { publishNotificationPrefs } from './events';
import { disablePush, enablePush, getPushState, getPushSupport, type PushState, type PushSupport } from './push';

export interface PushNotificationsState {
  /** null while the current state is read. */
  state: PushState | null;
  support: PushSupport;
  busy: boolean;
  error: string | null;
  /** Call from a click handler only: it may show the browser permission prompt. */
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

/** Device notification state and actions for Settings → "Nhắc học". */
export function usePushNotifications(): PushNotificationsState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const support = getPushSupport();

  useEffect(() => {
    let active = true;
    getPushState()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {
        if (active) setState('unsupported');
      });
    return () => {
      active = false;
    };
  }, []);

  const run = useCallback(
    async (action: typeof enablePush) => {
      if (!client || !userId) {
        setError(notificationErrorMessage(new Error('supabase_unavailable')));
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await action(client);
        setState(result.state);
        if (result.prefs) publishNotificationPrefs(userId, result.prefs);
      } catch (err) {
        setError(notificationErrorMessage(err));
        setState(await getPushState().catch(() => 'unsupported' as const));
      } finally {
        setBusy(false);
      }
    },
    [client, userId],
  );

  const enable = useCallback(() => run(enablePush), [run]);
  const disable = useCallback(() => run(disablePush), [run]);

  return { state, support, busy, error, enable, disable };
}
