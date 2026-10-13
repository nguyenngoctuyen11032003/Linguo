import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase, requireSupabase } from '@/lib/supabase';
import { fetchCurrentPathId, listPaths, setCurrentPath, type LearningPath } from './service';

export interface LearningPathsContextValue {
  status: 'loading' | 'ready' | 'error';
  error: unknown;
  paths: LearningPath[];
  currentId: string | null;
  current: LearningPath | null;
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
}

const empty = (ownerId: string | undefined): State => ({ ownerId, status: 'loading', error: null, paths: [], currentId: null });

const byCreatedAt = (a: LearningPath, b: LearningPath) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export function LearningPathsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [owned, setOwned] = useState<State>(() => empty(userId));
  const [attempt, setAttempt] = useState(0);
  const state = owned.ownerId === userId ? owned : empty(userId);
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
    setOwned((s) => (s.ownerId === userId ? { ...s, status: 'loading', error: null } : empty(userId)));
    Promise.all([listPaths(client), fetchCurrentPathId(client, userId)])
      .then(([paths, currentId]) => {
        if (!active) return;
        if (mutationSeq.current !== startedAt) {
          // Local state moved on while the fetch was in flight: discard the stale data and fetch again.
          setAttempt((n) => n + 1);
          return;
        }
        setOwned({ ownerId: userId, status: 'ready', error: null, paths, currentId });
      })
      .catch((error: unknown) => {
        if (!active) return;
        // Keep whatever was loaded before so a failed reload does not blank the screen.
        setOwned((s) => (s.ownerId === userId ? { ...s, status: 'error', error } : { ...empty(userId), status: 'error', error }));
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

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
