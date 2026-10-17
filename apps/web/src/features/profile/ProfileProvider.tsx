import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

/** An installed PWA lives for days in the background: re-read the profile when it comes back after at least this long. */
export const PROFILE_REFRESH_AFTER_MS = 60_000;

function sameProfile(a: Profile | null, b: Profile): boolean {
  return !!a && a.id === b.id && a.displayName === b.displayName && a.timezone === b.timezone && (a.avatarPath ?? null) === (b.avatarPath ?? null);
}

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

  /** Bumped by every local write and every load: a slower, older background read must never overwrite a newer value. */
  const writes = useRef(0);
  const lastRead = useRef(Date.now());
  useEffect(() => {
    writes.current += 1;
    lastRead.current = Date.now();
  }, [userId, attempt]);

  // Coming back to the app (phone: reopening the home-screen app, switching apps, another device changed the avatar):
  // quietly re-read the profile so a stale in-memory copy does not stay on screen.
  useEffect(() => {
    const client = getSupabase();
    if (!client || !userId) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastRead.current < PROFILE_REFRESH_AFTER_MS) return;
      lastRead.current = Date.now();
      const started = writes.current;
      fetchProfile(client, userId)
        .then((profile) => {
          if (!active || writes.current !== started) return;
          // Unchanged data keeps the same object: Settings resets its form on a new profile and must not lose typed edits.
          setOwned((s) => (s.ownerId === userId && s.status === 'ready' && !sameProfile(s.profile, profile) ? { status: 'ready', profile, error: null, ownerId: userId } : s));
        })
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [userId]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setProfile = useCallback(
    (profile: Profile) => {
      writes.current += 1;
      setOwned({ status: 'ready', profile, error: null, ownerId: userId });
    },
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
