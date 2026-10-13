import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { listReferenceHours, type ReferenceHoursByLanguage } from './service';

let cache: Promise<ReferenceHoursByLanguage> | null = null;

/** Test hook: forget the cached table. */
export function resetReferenceHoursCache(): void {
  cache = null;
}

interface ReferenceState {
  status: 'loading' | 'ready' | 'error';
  data: ReferenceHoursByLanguage | null;
}

/** The reference table is static per deploy: load once per page and share. `enabled=false` defers loading. */
export function useReferenceHours(enabled = true): ReferenceState & { retry: () => void } {
  const [state, setState] = useState<ReferenceState>({ status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const client = getSupabase();
    if (!client) {
      setState({ status: 'error', data: null });
      return;
    }
    let active = true;
    cache ??= listReferenceHours(client);
    cache
      .then((data) => {
        if (active) setState({ status: 'ready', data });
      })
      .catch(() => {
        cache = null;
        if (active) setState({ status: 'error', data: null });
      });
    return () => {
      active = false;
    };
  }, [enabled, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
