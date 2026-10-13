import { useCallback, useEffect, useReducer, useState } from 'react';
import type { StudySession, TodaySessionResult } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { getSupabase } from '@/lib/supabase';
import { sessionErrorMessage } from './error-map';
import { getTodaySession } from './service';

export interface TodaySessionState {
  status: 'loading' | 'ready' | 'error';
  /** Today's open (planned/in_progress) or latest session; null when none was planned today. */
  session: StudySession | null;
  studiedSecondsToday: number;
  dailyGoalMinutes: number;
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  reload: () => void;
  /** Puts the session returned by a mutation (save/reorder/update/finish) on screen without refetching. */
  setSession: (session: StudySession | null) => void;
}

interface Loaded {
  key: string;
  status: TodaySessionState['status'];
  result: TodaySessionResult | null;
  error: string | null;
}

/**
 * `get_today_session` for a learning path (default: the current one). The server is the source of truth, so a
 * reload restores the running session exactly where the learner left it.
 */
export function useTodaySession(pathId?: string | null): TodaySessionState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { currentId, status: pathsStatus } = useLearningPaths();
  const path = pathId === undefined ? currentId : pathId;
  const waitingForPath = !path && pathsStatus === 'loading';
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const key = `${userId ?? ''}:${path ?? ''}`;
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', result: null, error: null });

  useEffect(() => {
    if (!userId) return;
    if (!client) {
      setLoaded({ key, status: 'error', result: null, error: sessionErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    if (!path) {
      if (!waitingForPath) setLoaded({ key, status: 'error', result: null, error: sessionErrorMessage({ message: 'path_not_found' }) });
      return;
    }
    let active = true;
    // Keep the session of the same path on screen while refreshing.
    setLoaded((prev) => (prev.key === key ? { ...prev, status: prev.result ? prev.status : 'loading' } : { key, status: 'loading', result: null, error: null }));
    getTodaySession(client, path)
      .then((result) => {
        if (active) setLoaded({ key, status: 'ready', result, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ key, status: 'error', result: null, error: sessionErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [client, userId, path, waitingForPath, key, attempt]);

  const setSession = useCallback(
    (session: StudySession | null) => {
      setLoaded((prev) => {
        if (prev.key !== key || !prev.result) return prev;
        return { ...prev, status: 'ready', error: null, result: { ...prev.result, session } };
      });
    },
    [key],
  );

  const current = loaded.key === key ? loaded : { status: 'loading' as const, result: null, error: null };
  return {
    status: current.status,
    session: current.result?.session ?? null,
    studiedSecondsToday: current.result?.studied_seconds_today ?? 0,
    dailyGoalMinutes: current.result?.daily_goal_minutes ?? 0,
    error: current.error,
    reload,
    setSession,
  };
}
