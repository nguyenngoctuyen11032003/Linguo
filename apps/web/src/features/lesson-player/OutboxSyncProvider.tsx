import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { useOutboxSync, type OutboxResultHandler } from './useOutboxSync';

export interface OutboxSyncContextValue {
  /** Attempts waiting in the offline outbox for the signed-in user. */
  pendingCount: number;
  /** Sends every queued entry now (ignoring backoff). */
  flush: () => Promise<void>;
  /** Registers a handler for replayed results (the lesson on screen); returns the unsubscribe function. */
  subscribe: (handler: OutboxResultHandler) => () => void;
}

export const OutboxSyncContext = createContext<OutboxSyncContextValue | null>(null);

/**
 * Spec 2 §7.4: replays the offline outbox on every signed-in screen, not only inside a lesson, so queued answers
 * reach the server as soon as the app is open and online.
 */
export function OutboxSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const handlers = useRef(new Set<OutboxResultHandler>());
  const onResult = useCallback<OutboxResultHandler>((key, outcome, entry) => {
    for (const handler of handlers.current) handler(key, outcome, entry);
  }, []);
  const { pendingCount, flush } = useOutboxSync(getSupabase(), user?.id ?? null, onResult);

  const subscribe = useCallback((handler: OutboxResultHandler) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  const value = useMemo(() => ({ pendingCount, flush, subscribe }), [pendingCount, flush, subscribe]);
  return <OutboxSyncContext.Provider value={value}>{children}</OutboxSyncContext.Provider>;
}

export function useOutboxSyncContext(): OutboxSyncContextValue {
  const ctx = useContext(OutboxSyncContext);
  if (!ctx) throw new Error('useOutboxSyncContext must be used inside OutboxSyncProvider');
  return ctx;
}
