import { useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { localPreferenceEditVersion } from './local-edits';
import { fetchPreferences } from './service';

/** After sign-in, adopt the preferences saved on the server (other devices may have changed them). */
export function usePreferencesSync(): void {
  const { user } = useAuth();
  const { setPreference } = useTheme();
  const { setUserReduceMotion } = useMotionPrefs();
  const userId = user?.id;

  useEffect(() => {
    const client = getSupabase();
    if (!client || !userId) return;
    let active = true;
    const versionAtStart = localPreferenceEditVersion();
    fetchPreferences(client, userId)
      .then((prefs) => {
        if (!active) return;
        // The user changed something here while the request was in flight: their choice wins.
        if (localPreferenceEditVersion() !== versionAtStart) return;
        setPreference(prefs.theme);
        setUserReduceMotion(prefs.reduceMotion);
      })
      .catch(() => {
        // Keep the device-local preferences; Settings surfaces save errors.
      });
    return () => {
      active = false;
    };
  }, [userId, setPreference, setUserReduceMotion]);
}
