import { useEffect, useReducer, useRef, useState } from 'react';
import type { AdminOverview } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase, type AppSupabaseClient } from '@/lib/supabase';
import { adminErrorMessage } from './error-map';
import { getAdminOverview } from './service';

export interface AdminResourceState<T> {
  /** 'loading' also while a reload or another query runs; the previous data of the same user stays in `data`. */
  status: 'loading' | 'ready' | 'error';
  data: T | null;
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  /** Raw error, e.g. to tell a network failure from a refusal. */
  cause: unknown;
  reload: () => void;
}

interface Loaded<T> {
  user: string;
  key: string;
  status: 'loading' | 'ready' | 'error';
  data: T | null;
  error: string | null;
  cause: unknown;
}

/**
 * Loads one admin RPC for the signed-in user. `key` identifies the query (filters, page): when it changes the
 * previous data of the same user stays on screen while the new query runs. Data never leaks across users.
 */
export function useAdminResource<T>(key: string, load: (client: AppSupabaseClient) => Promise<T>): AdminResourceState<T> {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const [loaded, setLoaded] = useState<Loaded<T>>({ user: userId, key, status: 'loading', data: null, error: null, cause: null });
  // `load` is recreated on every render; the query is identified by `key`.
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    if (!userId) return;
    if (!client) {
      const cause = new Error('supabase_unavailable');
      setLoaded({ user: userId, key, status: 'error', data: null, error: adminErrorMessage(cause), cause });
      return;
    }
    let active = true;
    setLoaded((prev) =>
      prev.user === userId
        ? { ...prev, key, status: 'loading', error: null, cause: null }
        : { user: userId, key, status: 'loading', data: null, error: null, cause: null },
    );
    loader
      .current(client)
      .then((data) => {
        if (active) setLoaded({ user: userId, key, status: 'ready', data, error: null, cause: null });
      })
      .catch((cause: unknown) => {
        if (active) setLoaded((prev) => ({ user: userId, key, status: 'error', data: prev.user === userId ? prev.data : null, error: adminErrorMessage(cause), cause }));
      });
    return () => {
      active = false;
    };
  }, [client, userId, key, attempt]);

  if (!userId) return { status: 'loading', data: null, error: null, cause: null, reload };
  if (loaded.user !== userId) return { status: 'loading', data: null, error: null, cause: null, reload };
  if (loaded.key !== key) return { status: 'loading', data: loaded.data, error: null, cause: null, reload };
  return { status: loaded.status, data: loaded.data, error: loaded.error, cause: loaded.cause, reload };
}

/** admin_content_overview() (editor+). */
export function useAdminOverview(): AdminResourceState<AdminOverview> {
  return useAdminResource('overview', getAdminOverview);
}
