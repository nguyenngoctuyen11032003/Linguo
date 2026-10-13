import { useEffect, useReducer, useState } from 'react';
import type { ProgressDashboard, ProgressRange } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { progressErrorMessage } from './error-map';
import { getProgressDashboard } from './service';

export interface ProgressDashboardState {
  /** 'idle' while there is no path (or no signed-in user) to load. */
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** While a new range loads, the previous range of the same path stays here (status 'loading'). */
  data: ProgressDashboard | null;
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  reload: () => void;
}

interface Loaded {
  /** user:path — data never leaks across users or paths. */
  key: string;
  status: 'loading' | 'ready' | 'error';
  data: ProgressDashboard | null;
  error: string | null;
}

/** `get_progress_dashboard` for a path and range (spec 8 §4), same pattern as `useReviewSummary`. */
export function useProgressDashboard(pathId: string | null, range: ProgressRange): ProgressDashboardState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const key = `${userId ?? ''}:${pathId ?? ''}`;
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', data: null, error: null });
  const idle = !userId || !pathId;

  useEffect(() => {
    if (!userId || !pathId) return;
    if (!client) {
      setLoaded({ key, status: 'error', data: null, error: progressErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    // Keep the previous numbers of the same path on screen while another range (or a reload) is fetched.
    setLoaded((prev) =>
      prev.key === key ? { ...prev, status: 'loading', error: null } : { key, status: 'loading', data: null, error: null },
    );
    getProgressDashboard(client, pathId, range)
      .then((data) => {
        if (active) setLoaded({ key, status: 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ key, status: 'error', data: null, error: progressErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [client, userId, pathId, range, key, attempt]);

  if (idle) return { status: 'idle', data: null, error: null, reload };
  const current = loaded.key === key ? loaded : { status: 'loading' as const, data: null, error: null };
  return { status: current.status, data: current.data, error: current.error, reload };
}
