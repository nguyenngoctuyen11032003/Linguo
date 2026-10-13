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

interface OwnedState extends State {
  /** The user this state belongs to; a different current user means it is stale. */
  ownerId: string | undefined;
}

const LOADING: State = { status: 'loading', profile: null, error: null };

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [owned, setOwned] = useState<OwnedState>({ ...LOADING, ownerId: userId });
  const [attempt, setAttempt] = useState(0);

  // State fetched for another user (or before sign-in) must never leak: treat it as loading immediately,
  // in the same render in which the user changed.
  const state: State = owned.ownerId === userId ? owned : LOADING;

  useEffect(() => {
    const client = getSupabase();
    if (!client || !userId) return;
    let active = true;
    setOwned((s) => (s.ownerId === userId ? { ...s, status: 'loading', error: null } : { ...LOADING, ownerId: userId }));
    fetchProfile(client, userId)
      .then((profile) => {
        if (active) setOwned({ status: 'ready', profile, error: null, ownerId: userId });
      })
      .catch((error: unknown) => {
        if (active) setOwned({ status: 'error', profile: null, error, ownerId: userId });
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setProfile = useCallback(
    (profile: Profile) => setOwned({ status: 'ready', profile, error: null, ownerId: userId }),
    [userId],
  );
  const { status, profile, error } = state;
  const value = useMemo(() => ({ status, profile, error, reload, setProfile }), [status, profile, error, reload, setProfile]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
