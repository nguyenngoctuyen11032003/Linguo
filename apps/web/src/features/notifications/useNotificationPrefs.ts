import { useCallback, useEffect, useState } from 'react';
import type { NotificationPrefs, NotificationPrefsPatch } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { notificationErrorMessage } from './error-map';
import { publishNotificationPrefs, subscribeNotificationPrefs } from './events';
import { getNotificationPrefs, setNotificationPrefs } from './service';

export interface NotificationPrefsState {
  status: 'loading' | 'ready' | 'error';
  prefs: NotificationPrefs | null;
  /** Saves the patch; resolves true on success. On failure `error` is set and `prefs` keeps the saved values. */
  update: (patch: NotificationPrefsPatch) => Promise<boolean>;
  /** "bấm để nhắc như cũ": backoff_level and ignored_streak back to 0. */
  resetBackoff: () => Promise<boolean>;
  reload: () => void;
  saving: boolean;
  /** Vietnamese message for the last load or save failure. */
  error: string | null;
}

interface Loaded {
  userId: string | null;
  status: 'loading' | 'ready' | 'error';
  prefs: NotificationPrefs | null;
  error: string | null;
}

/** notification_prefs of the signed-in user via get/set_notification_prefs (spec 10 §2). */
export function useNotificationPrefs(): NotificationPrefsState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [loaded, setLoaded] = useState<Loaded>({ userId, status: 'loading', prefs: null, error: null });
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    if (!client) {
      setLoaded({ userId, status: 'error', prefs: null, error: notificationErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    setLoaded((prev) => (prev.userId === userId && prev.prefs ? prev : { userId, status: 'loading', prefs: null, error: null }));
    getNotificationPrefs(client)
      .then((prefs) => {
        if (active) setLoaded({ userId, status: 'ready', prefs, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ userId, status: 'error', prefs: null, error: notificationErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [client, userId, attempt]);

  useEffect(
    () =>
      subscribeNotificationPrefs((changedUser, prefs) => {
        if (changedUser === userId) setLoaded({ userId, status: 'ready', prefs, error: null });
      }),
    [userId],
  );

  const update = useCallback(
    async (patch: NotificationPrefsPatch): Promise<boolean> => {
      if (!userId) return false;
      if (!client) {
        setLoaded((prev) => ({ ...prev, error: notificationErrorMessage(new Error('supabase_unavailable')) }));
        return false;
      }
      setSaving(true);
      try {
        const prefs = await setNotificationPrefs(client, patch);
        publishNotificationPrefs(userId, prefs);
        setLoaded({ userId, status: 'ready', prefs, error: null });
        return true;
      } catch (error) {
        setLoaded((prev) => (prev.userId === userId ? { ...prev, error: notificationErrorMessage(error) } : prev));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [client, userId],
  );

  const resetBackoff = useCallback(() => update({ reset_backoff: true }), [update]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const current = loaded.userId === userId ? loaded : { status: 'loading' as const, prefs: null, error: null };
  return { status: current.status, prefs: current.prefs, update, resetBackoff, reload, saving, error: current.error };
}
