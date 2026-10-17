import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ZodType } from 'zod';
import { isUnansweredError } from '@/features/lesson-player/error-map';
import { readCached, writeCached } from './read-cache';
import { useOnline } from './useOnline';

/**
 * Stale-while-revalidate for a server read: shows the last saved copy at once, fetches in the background and saves the
 * result; when the server cannot be reached (offline, timeout, 5xx) the saved copy stays on screen, flagged `stale`.
 *
 * - `scope` is the identity of the data on screen (user + path): data never leaks across scopes. While a new `request`
 *   (e.g. another date range) loads inside the same scope the previous data stays.
 * - `request` names the cache entry and, when it changes, triggers a fetch. `cacheName` null disables caching.
 * - An error with no copy to fall back on is reported as `status: 'error'` (raw error; the caller maps the message).
 */
export interface ReadThroughOptions<T> {
  /** False while the inputs are not known yet (e.g. the learning path is still loading): stays 'loading', no fetch. */
  enabled: boolean;
  userId: string | null;
  scope: string;
  request: string;
  cacheName: string | null;
  schema: ZodType<T>;
  fetcher: () => Promise<T>;
  /** Applied to the data before it is saved (e.g. drop one-time fields such as freshly awarded badges). */
  forCache?: (data: T) => T;
  /** Report status 'loading' (keeping the data) while a refetch in the same scope runs; default keeps the status. */
  loadingOnRefetch?: boolean;
}

export interface ReadThrough<T> {
  status: 'loading' | 'ready' | 'error';
  data: T | null;
  /** Raw error when status is 'error'. */
  error: unknown;
  /** The data is a saved copy the server could not confirm (offline or unreachable). */
  stale: boolean;
  /** Epoch ms the copy on screen was fetched (or saved); null when there is none. */
  updatedAt: number | null;
  reload: () => void;
  /** Replaces the data on screen and saves it (a mutation returned the new state). No-op without data. */
  update: (fn: (data: T) => T) => void;
}

interface State<T> {
  scope: string;
  request: string;
  status: ReadThrough<T>['status'];
  data: T | null;
  error: unknown;
  stale: boolean;
  updatedAt: number | null;
}

export function useReadThrough<T>(options: ReadThroughOptions<T>): ReadThrough<T> {
  const { enabled, userId, scope, request, cacheName, schema, loadingOnRefetch = false } = options;
  const forCacheRef = useRef(options.forCache);
  const online = useOnline();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const fetcherRef = useRef(options.fetcher);
  const schemaRef = useRef(schema);
  useEffect(() => {
    fetcherRef.current = options.fetcher;
    schemaRef.current = schema;
    forCacheRef.current = options.forCache;
  });

  // The saved copy, read synchronously so the first render of a scope already has something to show.
  const cached = useMemo(
    () => (cacheName ? readCached(cacheName, userId, schemaRef.current) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new cacheName/userId is a new entry; the schema is constant per call site
    [cacheName, userId, attempt],
  );
  const [state, setState] = useState<State<T>>(() => ({
    scope,
    request,
    status: cached ? 'ready' : 'loading',
    data: cached?.data ?? null,
    error: null,
    stale: false,
    updatedAt: cached?.savedAt ?? null,
  }));

  useEffect(() => {
    if (!enabled || !userId) return;
    let active = true;
    // Same scope: keep what is on screen. A new scope starts from its own saved copy (or from nothing).
    setState((prev) =>
      prev.scope === scope
        ? { ...prev, request, ...(loadingOnRefetch && prev.data ? { status: 'loading' as const } : {}) }
        : { scope, request, status: cached ? 'ready' : 'loading', data: cached?.data ?? null, error: null, stale: false, updatedAt: cached?.savedAt ?? null },
    );
    const settleStale = (error: unknown) =>
      setState((prev) => {
        const data = prev.scope === scope ? prev.data : (cached?.data ?? null);
        if (data !== null && (isUnansweredError(error) || navigator.onLine === false)) {
          return { ...prev, scope, request, status: 'ready', data, error: null, stale: true, updatedAt: prev.updatedAt ?? cached?.savedAt ?? null };
        }
        return { scope, request, status: 'error', data: null, error, stale: false, updatedAt: null };
      });
    // Offline with something to show: no request that can only fail (or wait for the timeout).
    if (navigator.onLine === false) {
      settleStale(new TypeError('offline'));
      return;
    }
    fetcherRef
      .current()
      .then((data) => {
        if (!active) return;
        if (cacheName) writeCached(cacheName, userId, forCacheRef.current ? forCacheRef.current(data) : data);
        setState({ scope, request, status: 'ready', data, error: null, stale: false, updatedAt: Date.now() });
      })
      .catch((error: unknown) => {
        if (active) settleStale(error);
      });
    return () => {
      active = false;
    };
  }, [enabled, userId, scope, request, cacheName, cached, attempt, online, loadingOnRefetch]);

  const update = useCallback(
    (fn: (data: T) => T) => {
      setState((prev) => {
        if (prev.scope !== scope || prev.data === null) return prev;
        const data = fn(prev.data);
        if (cacheName) writeCached(cacheName, userId, data);
        return { ...prev, data, status: 'ready', error: null };
      });
    },
    [scope, cacheName, userId],
  );

  if (state.scope !== scope) {
    // The scope changed in this render and the effect has not run yet: show its saved copy, never the old scope's data.
    return {
      status: cached ? 'ready' : 'loading',
      data: cached?.data ?? null,
      error: null,
      stale: false,
      updatedAt: cached?.savedAt ?? null,
      reload,
      update,
    };
  }
  return { status: state.status, data: state.data, error: state.error, stale: state.stale, updatedAt: state.updatedAt, reload, update };
}
