import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { listReferenceHours, type ReferenceHoursByLanguage } from './service';

let cache: Promise<ReferenceHoursByLanguage> | null = null;
// Set once the shared load resolves, so later mounts start in `ready` without a spinner frame.
let resolved: ReferenceHoursByLanguage | null = null;

/** Test hook: forget the cached table. */
export function resetReferenceHoursCache(): void {
  cache = null;
  resolved = null;
}

interface ReferenceState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: ReferenceHoursByLanguage | null;
}

const initialState = (): ReferenceState => (resolved ? { status: 'ready', data: resolved } : { status: 'loading', data: null });

/** The reference table is static per deploy: load once per page and share. `enabled=false` defers loading (status `idle`). */
export function useReferenceHours(enabled = true): ReferenceState & { retry: () => void } {
  const [state, setState] = useState<ReferenceState>(initialState);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (resolved) {
      const data = resolved;
      setState((s) => (s.status === 'ready' && s.data === data ? s : { status: 'ready', data }));
      return;
    }
    const client = getSupabase();
    if (!client) {
      setState({ status: 'error', data: null });
      return;
    }
    let active = true;
    setState((s) => (s.status === 'loading' ? s : { status: 'loading', data: null }));
    const request = (cache ??= listReferenceHours(client));
    request
      .then((data) => {
        if (cache === request) resolved = data;
        if (active) setState({ status: 'ready', data });
      })
      .catch(() => {
        if (cache === request) cache = null;
        if (active) setState({ status: 'error', data: null });
      });
    return () => {
      active = false;
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return enabled ? { ...state, retry } : { status: 'idle', data: state.data, retry };
}
