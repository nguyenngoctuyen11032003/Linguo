import { useEffect } from 'react';
import { reviewQueueSchema, type ReviewQueue } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { readCached, removeCached, writeCached, type Cached } from '@/lib/read-cache';
import { getSupabase, type AppSupabaseClient } from '@/lib/supabase';
import { getReviewQueue } from './service';

// A copy of the due-card queue (per user and path, zod-validated, 7 days) so a review session can run with no network:
// grades go to the review outbox and sync later. The server stays authoritative: a session served from this copy
// never contains a card that was graded on this device (the card is dropped from the copy the moment it is graded or
// queued) nor one still waiting in the outbox (useReviewSession filters those when it loads).

/** The most `get_review_queue` serves in one call. */
export const REVIEW_PREFETCH_LIMIT = 100;
/** Prefetch at most this often per path (Home mounts, tab shows, network returns all ask). */
export const REVIEW_PREFETCH_MIN_INTERVAL_MS = 2 * 60 * 1000;

const cacheName = (pathId: string) => `review-queue:${pathId}`;

export function readReviewQueueCache(userId: string | null | undefined, pathId: string | null | undefined): Cached<ReviewQueue> | null {
  return pathId ? readCached(cacheName(pathId), userId, reviewQueueSchema) : null;
}

export function writeReviewQueueCache(userId: string, pathId: string, queue: ReviewQueue): void {
  writeCached(cacheName(pathId), userId, queue);
}

export function clearReviewQueueCache(userId: string, pathId: string): void {
  removeCached(cacheName(pathId), userId);
}

/** Removes one card from the cached queue (it was graded or postponed on this device). */
export function dropCardFromReviewQueueCache(userId: string, pathId: string | null, cardId: string): void {
  if (!pathId) return;
  const cached = readReviewQueueCache(userId, pathId);
  if (!cached || !cached.data.cards.some((c) => c.card_id === cardId)) return;
  const queue: ReviewQueue = { ...cached.data, cards: cached.data.cards.filter((c) => c.card_id !== cardId) };
  writeCached(cacheName(pathId), userId, queue);
}

/**
 * Fetches up to 100 due cards and stores them. Skipped (false) when the cached copy is younger than
 * REVIEW_PREFETCH_MIN_INTERVAL_MS or the device is offline; never throws.
 */
export async function prefetchReviewQueue(client: AppSupabaseClient, userId: string, pathId: string, now = Date.now()): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const cached = readReviewQueueCache(userId, pathId);
  if (cached && now - cached.savedAt < REVIEW_PREFETCH_MIN_INTERVAL_MS) return false;
  try {
    const queue = await getReviewQueue(client, pathId, { limit: REVIEW_PREFETCH_LIMIT });
    writeReviewQueueCache(userId, pathId, queue);
    return true;
  } catch {
    return false;
  }
}

/** Keeps the cached queue of the current path fresh: on mount, when the network returns and when the tab is shown. */
export function useReviewQueuePrefetch(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { currentId: pathId } = useLearningPaths();
  const client = getSupabase();
  useEffect(() => {
    if (!userId || !pathId || !client) return;
    const run = () => void prefetchReviewQueue(client, userId, pathId);
    run();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [client, userId, pathId]);
}
