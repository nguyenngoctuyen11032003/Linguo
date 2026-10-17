import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { isNetworkError } from '@/lib/network-error';
import { getSupabase, requireSupabase } from '@/lib/supabase';
import { fetchCurrentPathId, listPaths, setCurrentPath, type LearningPath } from './service';
import { readPathsSnapshot, writePathsSnapshot } from './snapshot';

export interface LearningPathsContextValue {
  status: 'loading' | 'ready' | 'error';
  error: unknown;
  paths: LearningPath[];
  currentId: string | null;
  current: LearningPath | null;
  /**
   * True while the paths on screen are the last copy saved on this device and the server has not confirmed them yet
   * (offline, or the revalidation is still running). Absent means false (hand-built test values).
   */
  fromCache?: boolean;
  /** True once a revalidation failed on the network while a saved copy is shown: the data really is possibly out of date. */
  stale?: boolean;
  reload: () => void;
  /** Persists the choice through the RPC, then updates local state. Throws on failure. Only the latest call is applied. */
  setCurrent: (id: string) => Promise<void>;
  /**
   * Merge a path returned by an RPC; archived paths are removed. When the current path is archived the local
   * current falls back to the first remaining path, but the server may have picked another one: callers must
   * `reload()` afterwards to adopt the server's choice.
   */
  upsertPath: (path: LearningPath, options?: { makeCurrent?: boolean }) => void;
}

export const LearningPathsContext = createContext<LearningPathsContextValue | null>(null);

interface State {
  ownerId: string | undefined;
  status: LearningPathsContextValue['status'];
  error: unknown;
  paths: LearningPath[];
  currentId: string | null;
  fromCache: boolean;
  stale: boolean;
}

const empty = (ownerId: string | undefined): State => ({ ownerId, status: 'loading', error: null, paths: [], currentId: null, fromCache: false, stale: false });

/**
 * The saved paths as a ready state, so the learning screens work at once and offline; plain loading when this
 * device has none (a first sign-in) or only an empty list (never cached: it would force onboarding).
 */
function hydrate(ownerId: string | undefined): State {
  const snap = ownerId ? readPathsSnapshot(ownerId) : null;
  return snap ? { ownerId, status: 'ready', error: null, paths: snap.paths, currentId: snap.currentId, fromCache: true, stale: false } : empty(ownerId);
}

const byCreatedAt = (a: LearningPath, b: LearningPath) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export function LearningPathsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [owned, setOwned] = useState<State>(() => hydrate(userId));
  const [attempt, setAttempt] = useState(0);
  const hydrated = useMemo(() => hydrate(userId), [userId]);
  const state = owned.ownerId === userId ? owned : hydrated;
  // Bumped by every local mutation; a fetch that started before a mutation must not overwrite it.
  const mutationSeq = useRef(0);
  // Identifies the latest setCurrent call so out-of-order resolutions are ignored.
  const setCurrentSeq = useRef(0);

  useEffect(() => {
    if (!userId) return;
    const client = getSupabase();
    if (!client) {
      setOwned({ ...empty(userId), status: 'error', error: new Error('supabase_unavailable') });
      return;
    }
    let active = true;
    const startedAt = mutationSeq.current;
    setOwned((s) => (s.ownerId === userId ? { ...s, status: s.fromCache ? 'ready' : 'loading', error: null } : hydrate(userId)));
    Promise.all([listPaths(client), fetchCurrentPathId(client, userId)])
      .then(([paths, currentId]) => {
        if (!active) return;
        if (mutationSeq.current !== startedAt) {
          // Local state moved on while the fetch was in flight: discard the stale data and fetch again.
          setAttempt((n) => n + 1);
          return;
        }
        setOwned({ ownerId: userId, status: 'ready', error: null, paths, currentId, fromCache: false, stale: false });
      })
      .catch((error: unknown) => {
        if (!active) return;
        // Keep whatever was loaded before so a failed reload does not blank the screen. With no network and paths on
        // screen (saved copy or an earlier load) that is not an error at all: the learner just keeps learning.
        setOwned((s) => {
          if (s.ownerId !== userId) return { ...empty(userId), status: 'error', error };
          if (isNetworkError(error) && s.paths.length > 0) return { ...s, status: 'ready', error: null, fromCache: true, stale: true };
          return { ...s, status: 'error', error };
        });
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  // Persist what the server last confirmed (including local edits made through setCurrent/upsertPath) for the next
  // offline launch. A copy that is itself from the cache is never re-saved.
  useEffect(() => {
    if (!userId || owned.ownerId !== userId || owned.status !== 'ready' || owned.fromCache) return;
    writePathsSnapshot(userId, { paths: owned.paths, currentId: owned.currentId });
  }, [userId, owned]);

  // Back online (or back in the app) while a saved copy is on screen: confirm it right away.
  const showingCache = state.fromCache;
  useEffect(() => {
    if (!userId || !showingCache) return;
    const retry = () => {
      if (document.visibilityState !== 'hidden' && navigator.onLine !== false) setAttempt((n) => n + 1);
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [userId, showingCache]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const setCurrent = useCallback(
    async (id: string) => {
      const call = ++setCurrentSeq.current;
      mutationSeq.current++;
      await setCurrentPath(requireSupabase(), id);
      if (call !== setCurrentSeq.current) return;
      mutationSeq.current++;
      setOwned((s) => (s.ownerId === userId ? { ...s, currentId: id } : s));
    },
    [userId],
  );

  const upsertPath = useCallback(
    (path: LearningPath, options: { makeCurrent?: boolean } = {}) => {
      mutationSeq.current++;
      setOwned((s) => {
        if (s.ownerId !== userId) return s;
        const others = s.paths.filter((p) => p.id !== path.id);
        if (path.status === 'archived') {
          return { ...s, paths: others, currentId: s.currentId === path.id ? null : s.currentId };
        }
        const paths = [...others, path].sort(byCreatedAt);
        return { ...s, paths, currentId: options.makeCurrent ? path.id : s.currentId };
      });
    },
    [userId],
  );

  const value = useMemo<LearningPathsContextValue>(() => {
    const current = state.paths.find((p) => p.id === state.currentId) ?? state.paths[0] ?? null;
    return {
      status: state.status,
      error: state.error,
      paths: state.paths,
      currentId: current?.id ?? null,
      current,
      fromCache: state.fromCache,
      stale: state.stale,
      reload,
      setCurrent,
      upsertPath,
    };
  }, [state, reload, setCurrent, upsertPath]);

  return <LearningPathsContext.Provider value={value}>{children}</LearningPathsContext.Provider>;
}

export function useLearningPaths(): LearningPathsContextValue {
  const ctx = useContext(LearningPathsContext);
  if (!ctx) throw new Error('useLearningPaths must be used inside <LearningPathsProvider>');
  return ctx;
}
