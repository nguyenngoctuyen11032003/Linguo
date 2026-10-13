import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { REVIEW_OUTBOX_CHANNEL, type ReviewOutboxResultHandler } from '@/features/reviews/outbox';
import { getSupabase } from '@/lib/supabase';
import { useOutboxChannelSync, useOutboxSync, type OutboxResultHandler } from './useOutboxSync';

export interface ReviewOutboxSyncValue {
  /** Review grades waiting in the review outbox for the signed-in user. */
  pendingCount: number;
  /** Sends every queued grade now (ignoring backoff). */
  flush: () => Promise<void>;
  /** Registers a handler for replayed grades (the review session on screen); returns the unsubscribe function. */
  subscribe: (handler: ReviewOutboxResultHandler) => () => void;
}

export interface OutboxSyncContextValue {
  /** Attempts waiting in the offline lesson outbox for the signed-in user. */
  pendingCount: number;
  /** Sends every queued lesson attempt now (ignoring backoff). */
  flush: () => Promise<void>;
  /** Registers a handler for replayed results (the lesson on screen); returns the unsubscribe function. */
  subscribe: (handler: OutboxResultHandler) => () => void;
  /** Spec 3: the review-grade outbox, replayed by the same provider. */
  reviews: ReviewOutboxSyncValue;
}

export const OutboxSyncContext = createContext<OutboxSyncContextValue | null>(null);

/** A set of result handlers fanned out from one sync hook. */
function useHandlers<H extends (...args: never[]) => void>() {
  const handlers = useRef(new Set<H>());
  const dispatch = useCallback((...args: Parameters<H>) => {
    for (const handler of handlers.current) handler(...args);
  }, []);
  const subscribe = useCallback((handler: H) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);
  return { dispatch, subscribe };
}

/**
 * Spec 2 §7.4 / spec 3 §6: replays the offline outboxes (lesson answers, review grades) on every signed-in screen,
 * not only inside a lesson or a review session, so queued work reaches the server as soon as the app is open and online.
 */
export function OutboxSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const lesson = useHandlers<OutboxResultHandler>();
  const review = useHandlers<ReviewOutboxResultHandler>();
  const { pendingCount, flush } = useOutboxSync(client, userId, lesson.dispatch);
  const reviewSync = useOutboxChannelSync(REVIEW_OUTBOX_CHANNEL, client, userId, review.dispatch);

  const reviews = useMemo(
    () => ({ pendingCount: reviewSync.pendingCount, flush: reviewSync.flush, subscribe: review.subscribe }),
    [reviewSync.pendingCount, reviewSync.flush, review.subscribe],
  );
  const value = useMemo(
    () => ({ pendingCount, flush, subscribe: lesson.subscribe, reviews }),
    [pendingCount, flush, lesson.subscribe, reviews],
  );
  return <OutboxSyncContext.Provider value={value}>{children}</OutboxSyncContext.Provider>;
}

export function useOutboxSyncContext(): OutboxSyncContextValue {
  const ctx = useContext(OutboxSyncContext);
  if (!ctx) throw new Error('useOutboxSyncContext must be used inside OutboxSyncProvider');
  return ctx;
}
