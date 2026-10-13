import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  /** Persists the choice through the RPC, then updates local state. Throws on failure. */
  setCurrent: (id: string) => Promise<void>;
  /** Merge a path returned by an RPC; archived paths are removed. */
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

export function LearningPathsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [owned, setOwned] = useState<State>(() => empty(userId));
  const [attempt, setAttempt] = useState(0);
  const state = owned.ownerId === userId ? owned : empty(userId);

  useEffect(() => {
    const client = getSupabase();
    if (!client || !userId) return;
    let active = true;
    setOwned((s) => (s.ownerId === userId ? { ...s, status: 'loading', error: null } : empty(userId)));
    Promise.all([listPaths(client), fetchCurrentPathId(client, userId)])
      .then(([paths, currentId]) => {
        if (active) setOwned({ ownerId: userId, status: 'ready', error: null, paths, currentId });
      })
      .catch((error: unknown) => {
        if (active) setOwned({ ...empty(userId), status: 'error', error });
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const setCurrent = useCallback(
    async (id: string) => {
      await setCurrentPath(requireSupabase(), id);
      setOwned((s) => (s.ownerId === userId ? { ...s, currentId: id } : s));
    },
    [userId],
  );

  const upsertPath = useCallback(
    (path: LearningPath, options: { makeCurrent?: boolean } = {}) => {
      setOwned((s) => {
        if (s.ownerId !== userId) return s;
        const others = s.paths.filter((p) => p.id !== path.id);
        const paths = path.status === 'archived' ? others : [...others, path].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const currentId = options.makeCurrent ? path.id : s.currentId;
        return { ...s, paths, currentId };
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
