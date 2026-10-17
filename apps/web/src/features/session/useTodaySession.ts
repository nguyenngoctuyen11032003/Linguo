import { useCallback } from 'react';
import { todaySessionResultSchema, type StudySession, type TodaySessionResult } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { getSupabase } from '@/lib/supabase';
import { useReadThrough } from '@/lib/useReadThrough';
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
  /** The session is the copy saved on this device and the server could not confirm it (offline). */
  stale?: boolean;
  /** Epoch ms of the copy on screen (for "Cập nhật lúc HH:mm"). */
  updatedAt?: number | null;
}

/**
 * `get_today_session` for a learning path (default: the current one). The server is the source of truth, so a
 * reload restores the running session exactly where the learner left it; when it cannot be reached the last copy
 * saved on this device is shown.
 */
export function useTodaySession(pathId?: string | null): TodaySessionState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { currentId, status: pathsStatus } = useLearningPaths();
  const path = pathId === undefined ? currentId : pathId;
  const waitingForPath = !path && pathsStatus === 'loading';
  const client = getSupabase();
  const read = useReadThrough<TodaySessionResult>({
    enabled: !waitingForPath,
    userId,
    scope: `${userId ?? ''}:${path ?? ''}`,
    request: path ?? '',
    cacheName: path ? `today-session:${path}` : null,
    schema: todaySessionResultSchema,
    fetcher: () => {
      if (!client) return Promise.reject(new Error('supabase_unavailable'));
      if (!path) return Promise.reject({ message: 'path_not_found' });
      return getTodaySession(client, path);
    },
  });

  const { update } = read;
  const setSession = useCallback((session: StudySession | null) => update((result) => ({ ...result, session })), [update]);

  const result = read.data;
  return {
    status: read.status,
    session: result?.session ?? null,
    studiedSecondsToday: result?.studied_seconds_today ?? 0,
    dailyGoalMinutes: result?.daily_goal_minutes ?? 0,
    error: read.status === 'error' ? sessionErrorMessage(read.error) : null,
    reload: read.reload,
    setSession,
    stale: read.stale,
    updatedAt: read.updatedAt,
  };
}
