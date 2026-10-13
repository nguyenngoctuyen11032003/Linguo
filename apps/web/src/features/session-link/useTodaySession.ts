import { useEffect, useReducer, useState } from 'react';
import type { TodaySessionResult } from '@linguo/shared';
import { getSupabase } from '@/lib/supabase';
import { getTodaySession, isMissingRpc } from './service';

export interface TodaySessionState {
  /** 'unavailable': no backend or the RPC is not deployed — the home card hides itself. */
  status: 'loading' | 'ready' | 'error' | 'unavailable';
  data: TodaySessionResult | null;
  reload: () => void;
}

interface Loaded {
  key: string;
  status: TodaySessionState['status'];
  data: TodaySessionResult | null;
}

/** get_today_session for a learning path (spec 6 §4 home card). */
export function useTodaySession(pathId: string | null): TodaySessionState {
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const key = pathId ?? '';
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', data: null });

  useEffect(() => {
    if (!pathId) return;
    if (!client) {
      setLoaded({ key, status: 'unavailable', data: null });
      return;
    }
    let active = true;
    setLoaded((prev) => (prev.key === key && prev.status === 'ready' ? prev : { key, status: 'loading', data: null }));
    getTodaySession(client, pathId)
      .then((data) => {
        if (active) setLoaded({ key, status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ key, status: isMissingRpc(error) ? 'unavailable' : 'error', data: null });
      });
    return () => {
      active = false;
    };
  }, [client, pathId, key, attempt]);

  const current = loaded.key === key ? loaded : { status: 'loading' as const, data: null };
  return { status: current.status, data: current.data, reload };
}
