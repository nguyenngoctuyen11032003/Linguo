import { useCallback, useContext, useEffect } from 'react';
import { reviewSummarySchema, type ReviewSummary } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { OutboxSyncContext } from '@/features/lesson-player/OutboxSyncProvider';
import { getSupabase } from '@/lib/supabase';
import { useReadThrough } from '@/lib/useReadThrough';
import { reviewErrorMessage } from './error-map';
import { getReviewSummary } from './service';

export interface ReviewSummaryState {
  status: 'loading' | 'ready' | 'error';
  summary: ReviewSummary | null;
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  reload: () => void;
  /** The numbers are the copy saved on this device and the server could not confirm them (offline). */
  stale?: boolean;
  /** Epoch ms of the copy on screen (for "Cập nhật lúc HH:mm"). */
  updatedAt?: number | null;
}

/**
 * `review_summary` for a learning path (default: the current one). Refetched when a queued grade from the review
 * outbox reaches the server. Works outside OutboxSyncProvider too (no refresh on sync then). The last numbers are
 * saved on the device and shown when the server cannot be reached.
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
  const read = useReadThrough<ReviewSummary>({
    enabled: !waitingForPath,
    userId,
    scope: `${userId ?? ''}:${path ?? ''}`,
    request: path ?? '',
    cacheName: path ? `review-summary:${path}` : null,
    schema: reviewSummarySchema,
    fetcher: () => {
      if (!client) return Promise.reject(new Error('supabase_unavailable'));
      if (!path) return Promise.reject({ message: 'path_not_found' });
      return getReviewSummary(client, path);
    },
  });

  const { reload } = read;
  const onSynced = useCallback(() => reload(), [reload]);
  useEffect(() => (subscribe ? subscribe(onSynced) : undefined), [subscribe, onSynced]);

  return {
    status: read.status,
    summary: read.data,
    error: read.status === 'error' ? reviewErrorMessage(read.error) : null,
    reload,
    stale: read.stale,
    updatedAt: read.updatedAt,
  };
}
