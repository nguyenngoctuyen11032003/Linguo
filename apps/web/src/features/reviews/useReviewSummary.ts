import { useCallback, useContext, useEffect, useReducer, useState } from 'react';
import type { ReviewSummary } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { OutboxSyncContext } from '@/features/lesson-player/OutboxSyncProvider';
import { getSupabase } from '@/lib/supabase';
import { reviewErrorMessage } from './error-map';
import { getReviewSummary } from './service';

export interface ReviewSummaryState {
  status: 'loading' | 'ready' | 'error';
  summary: ReviewSummary | null;
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  reload: () => void;
}

interface Loaded {
  key: string;
  status: ReviewSummaryState['status'];
  summary: ReviewSummary | null;
  error: string | null;
}

/**
 * `review_summary` for a learning path (default: the current one). Refetched when a queued grade from the review
 * outbox reaches the server. Works outside OutboxSyncProvider too (no refresh on sync then).
 */
export function useReviewSummary(pathId?: string | null): ReviewSummaryState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { currentId, status: pathsStatus } = useLearningPaths();
  const path = pathId === undefined ? currentId : pathId;
  const waitingForPath = !path && pathsStatus === 'loading';
  const client = getSupabase();
  const outbox = useContext(OutboxSyncContext);
  const subscribe = outbox?.reviews.subscribe;
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const key = `${userId ?? ''}:${path ?? ''}`;
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', summary: null, error: null });

  useEffect(() => {
    if (!userId) return;
    if (!client) {
      setLoaded({ key, status: 'error', summary: null, error: reviewErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    if (!path) {
      if (!waitingForPath) {
        setLoaded({ key, status: 'error', summary: null, error: reviewErrorMessage({ message: 'path_not_found' }) });
      }
      return;
    }
    let active = true;
    // Keep showing the previous numbers of the same path while refreshing.
    setLoaded((prev) => (prev.key === key ? prev : { key, status: 'loading', summary: null, error: null }));
    getReviewSummary(client, path)
      .then((summary) => {
        if (active) setLoaded({ key, status: 'ready', summary, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ key, status: 'error', summary: null, error: reviewErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [client, userId, path, waitingForPath, key, attempt]);

  const onSynced = useCallback(() => reload(), []);
  useEffect(() => (subscribe ? subscribe(onSynced) : undefined), [subscribe, onSynced]);

  const current = loaded.key === key ? loaded : { status: 'loading' as const, summary: null, error: null };
  return { status: current.status, summary: current.summary, error: current.error, reload };
}
