import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchProfile, type Profile } from './service';

export interface ProfileContextValue {
  status: 'loading' | 'ready' | 'error';
  profile: Profile | null;
  error: unknown;
  reload: () => void;
  setProfile: (profile: Profile) => void;
}

export const ProfileContext = createContext<ProfileContextValue | null>(null);

interface State {
  status: ProfileContextValue['status'];
  profile: Profile | null;
  error: unknown;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<State>({ status: 'loading', profile: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const client = getSupabase();
    if (!client || !userId) return;
    let active = true;
    setState((s) => ({ ...s, status: 'loading', error: null }));
    fetchProfile(client, userId)
      .then((profile) => {
        if (active) setState({ status: 'ready', profile, error: null });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', profile: null, error });
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setProfile = useCallback((profile: Profile) => setState({ status: 'ready', profile, error: null }), []);
  const value = useMemo(() => ({ ...state, reload, setProfile }), [state, reload, setProfile]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
