import { progressDashboardSchema, type ProgressDashboard, type ProgressRange } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { useReadThrough } from '@/lib/useReadThrough';
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
  /** The numbers are the copy saved on this device and the server could not confirm them (offline). */
  stale?: boolean;
  /** Epoch ms of the copy on screen (for "Cập nhật lúc HH:mm"). */
  updatedAt?: number | null;
}

/**
 * `get_progress_dashboard` for a path and range (spec 8 §4), same pattern as `useReviewSummary`: the last numbers of
 * each range are saved on the device and shown when the server cannot be reached.
 */
export function useProgressDashboard(pathId: string | null, range: ProgressRange): ProgressDashboardState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const idle = !userId || !pathId;
  const read = useReadThrough<ProgressDashboard>({
    enabled: !idle,
    userId,
    scope: `${userId ?? ''}:${pathId ?? ''}`,
    request: `${pathId ?? ''}:${range}`,
    cacheName: pathId ? `progress:${pathId}:${range}` : null,
    schema: progressDashboardSchema,
    loadingOnRefetch: true,
    // A badge is announced by the call that awarded it; a saved copy must not announce it again on the next launch.
    forCache: (data) => (data.motivation ? { ...data, motivation: { ...data.motivation, new_badges: [] } } : data),
    fetcher: () => {
      if (!client) return Promise.reject(new Error('supabase_unavailable'));
      return getProgressDashboard(client, pathId!, range);
    },
  });
  if (idle) return { status: 'idle', data: null, error: null, reload: read.reload };
  return {
    status: read.status,
    data: read.data,
    error: read.status === 'error' ? progressErrorMessage(read.error) : null,
    reload: read.reload,
    stale: read.stale,
    updatedAt: read.updatedAt,
  };
}
