import { useEffect, useReducer, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { aiRpcErrorMessage } from './error-map';
import { AI_QUOTA_DEFAULT_LIMIT, getAiQuotaStatus, remainingOf, subscribeAiRuns, type AiQuota } from './quota';

export interface AiQuotaState {
  status: 'loading' | 'ready' | 'error';
  quota: AiQuota | null;
  /** `limit - used`, never negative; null until loaded. */
  remaining: number | null;
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  refresh: () => void;
}

interface Loaded {
  userId: string | null;
  status: AiQuotaState['status'];
  quota: AiQuota | null;
  error: string | null;
}

/**
 * Today's AI quota (`ai_quota_status`). After every `useAiTutor` run it takes the quota from the answer, or
 * refetches when the answer carried none (network failure, malformed body).
 */
export function useAiQuota(limit: number = AI_QUOTA_DEFAULT_LIMIT): AiQuotaState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [attempt, refresh] = useReducer((n: number) => n + 1, 0);
  const [loaded, setLoaded] = useState<Loaded>({ userId, status: 'loading', quota: null, error: null });

  useEffect(() => {
    if (!userId) return;
    if (!client) {
      setLoaded({ userId, status: 'error', quota: null, error: aiRpcErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    // Keep the previous numbers of the same user while refreshing.
    setLoaded((prev) => (prev.userId === userId ? prev : { userId, status: 'loading', quota: null, error: null }));
    getAiQuotaStatus(client, limit)
      .then((quota) => {
        if (active) setLoaded({ userId, status: 'ready', quota, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded((prev) => ({ userId, status: 'error', quota: prev.userId === userId ? prev.quota : null, error: aiRpcErrorMessage(error) }));
      });
    return () => {
      active = false;
    };
  }, [client, userId, limit, attempt]);

  useEffect(
    () =>
      subscribeAiRuns((quota) => {
        if (quota && userId) setLoaded({ userId, status: 'ready', quota, error: null });
        else refresh();
      }),
    [userId],
  );

  const current = loaded.userId === userId ? loaded : { status: 'loading' as const, quota: null, error: null };
  return {
    status: current.status,
    quota: current.quota,
    remaining: current.quota ? remainingOf(current.quota) : null,
    error: current.error,
    refresh,
  };
}
