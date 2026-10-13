import { useCallback, useEffect, useState } from 'react';
import type { MotivationPrefs } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { progressErrorMessage } from './error-map';
import { publishMotivationPrefs, subscribeMotivationPrefs } from './prefs-events';
import { getMotivationPrefs, updateMotivationPrefs } from './service';

export interface MotivationPrefsState {
  status: 'loading' | 'ready' | 'error';
  prefs: MotivationPrefs | null;
  /** Saves the patch; on failure `error` is set and `prefs` keeps the last saved values. Never rejects. */
  update: (patch: Partial<MotivationPrefs>) => Promise<void>;
  saving: boolean;
  /** Vietnamese message for the last load or save failure. */
  error: string | null;
}

interface Loaded {
  userId: string | null;
  status: 'loading' | 'ready' | 'error';
  prefs: MotivationPrefs | null;
  error: string | null;
}

/** `user_preferences.show_motivation` / `analytics_opt_out` of the signed-in user (spec 8 §4). */
export function useMotivationPrefs(): MotivationPrefsState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [loaded, setLoaded] = useState<Loaded>({ userId, status: 'loading', prefs: null, error: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (!client) {
      setLoaded({ userId, status: 'error', prefs: null, error: progressErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    setLoaded((prev) => (prev.userId === userId ? prev : { userId, status: 'loading', prefs: null, error: null }));
    getMotivationPrefs(client, userId)
      .then((prefs) => {
        if (active) setLoaded({ userId, status: 'ready', prefs, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ userId, status: 'error', prefs: null, error: progressErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [client, userId]);

  useEffect(
    () =>
      subscribeMotivationPrefs((changedUser, prefs) => {
        if (changedUser === userId) setLoaded({ userId, status: 'ready', prefs, error: null });
      }),
    [userId],
  );

  const update = useCallback(
    async (patch: Partial<MotivationPrefs>) => {
      if (!userId) return;
      if (!client) {
        setLoaded((prev) => ({ ...prev, error: progressErrorMessage(new Error('supabase_unavailable')) }));
        return;
      }
      setSaving(true);
      try {
        const prefs = await updateMotivationPrefs(client, userId, patch);
        publishMotivationPrefs(userId, prefs);
        setLoaded({ userId, status: 'ready', prefs, error: null });
      } catch (error) {
        setLoaded((prev) => (prev.userId === userId ? { ...prev, error: progressErrorMessage(error) } : prev));
      } finally {
        setSaving(false);
      }
    },
    [client, userId],
  );

  const current = loaded.userId === userId ? loaded : { status: 'loading' as const, prefs: null, error: null };
  return { status: current.status, prefs: current.prefs, update, saving, error: current.error };
}
