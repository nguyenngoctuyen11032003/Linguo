import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isNetworkError } from '@/lib/network-error';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchProfile, type Profile } from './service';
import { readProfileSnapshot, writeProfileSnapshot } from './snapshot';

export interface ProfileContextValue {
  status: 'loading' | 'ready' | 'error';
  profile: Profile | null;
  error: unknown;
  /**
   * True while `profile` is the last copy saved on this device and the server has not confirmed it yet (offline, or the
   * revalidation is still running). The data is real, only possibly out of date.
   * Absent means false (hand-built test values).
   */
  fromCache?: boolean;
  reload: () => void;
  setProfile: (profile: Profile) => void;
}

export const ProfileContext = createContext<ProfileContextValue | null>(null);

interface State {
  status: ProfileContextValue['status'];
  profile: Profile | null;
  error: unknown;
  fromCache: boolean;
}

interface OwnedState extends State {
  /** The user this state belongs to; a different current user means it is stale. */
  ownerId: string | undefined;
}

const LOADING: State = { status: 'loading', profile: null, error: null, fromCache: false };

/** The saved copy as a ready state (instant, works offline), or plain loading when this device has none. */
function hydrate(userId: string | undefined): State {
  const cached = userId ? readProfileSnapshot(userId) : null;
  return cached ? { status: 'ready', profile: cached, error: null, fromCache: true } : LOADING;
}

/** An installed PWA lives for days in the background: re-read the profile when it comes back after at least this long. */
export const PROFILE_REFRESH_AFTER_MS = 60_000;

function sameProfile(a: Profile | null, b: Profile): boolean {
  return !!a && a.id === b.id && a.displayName === b.displayName && a.timezone === b.timezone && (a.avatarPath ?? null) === (b.avatarPath ?? null);
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [owned, setOwned] = useState<OwnedState>(() => ({ ...hydrate(userId), ownerId: userId }));
  const [attempt, setAttempt] = useState(0);

  // State fetched for another user (or before sign-in) must never leak: treat it as loading immediately,
  // in the same render in which the user changed.
  const hydrated = useMemo(() => hydrate(userId), [userId]);
  const state: State = owned.ownerId === userId ? owned : hydrated;

  useEffect(() => {
    const client = getSupabase();
    if (!client || !userId) return;
    let active = true;
    setOwned((s) => (s.ownerId === userId ? { ...s, status: s.fromCache ? 'ready' : 'loading', error: null } : { ...hydrate(userId), ownerId: userId }));
    fetchProfile(client, userId)
      .then((profile) => {
        if (!active) return;
        writeProfileSnapshot(userId, profile);
        setOwned({ status: 'ready', profile, error: null, fromCache: false, ownerId: userId });
      })
      .catch((error: unknown) => {
        if (!active) return;
        // No network: keep showing the saved copy (a profile the learner already had) instead of an error card.
        setOwned((s) =>
          isNetworkError(error) && s.ownerId === userId && s.profile
            ? { ...s, status: 'ready', error: null, fromCache: true }
            : { status: 'error', profile: null, error, fromCache: false, ownerId: userId },
        );
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
    const refresh = (force = false) => {
      if (document.visibilityState === 'hidden' || (!force && Date.now() - lastRead.current < PROFILE_REFRESH_AFTER_MS)) return;
      lastRead.current = Date.now();
      const started = writes.current;
      fetchProfile(client, userId)
        .then((profile) => {
          if (!active || writes.current !== started) return;
          // Unchanged data keeps the same object: Settings resets its form on a new profile and must not lose typed edits.
          writeProfileSnapshot(userId, profile);
          setOwned((s) => {
            if (s.ownerId !== userId || s.status !== 'ready') return s;
            if (!sameProfile(s.profile, profile)) return { status: 'ready', profile, error: null, fromCache: false, ownerId: userId };
            return s.fromCache ? { ...s, fromCache: false } : s;
          });
        })
        .catch(() => undefined);
    };
    const onReturn = () => refresh();
    // Network came back while a saved copy is on screen: confirm it right away, not after the 60 s throttle.
    const onOnline = () => refresh(true);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    window.addEventListener('pageshow', onReturn);
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('pageshow', onReturn);
      window.removeEventListener('online', onOnline);
    };
  }, [userId]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setProfile = useCallback(
    (profile: Profile) => {
      writes.current += 1;
      if (userId) writeProfileSnapshot(userId, profile);
      setOwned({ status: 'ready', profile, error: null, fromCache: false, ownerId: userId });
    },
    [userId],
  );
  const { status, profile, error, fromCache } = state;
  const value = useMemo(() => ({ status, profile, error, fromCache, reload, setProfile }), [status, profile, error, fromCache, reload, setProfile]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
