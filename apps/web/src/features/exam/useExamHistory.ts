import { useEffect, useReducer, useState } from 'react';
import type { ExamHistoryEntry } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { examErrorMessage } from './error-map';
import { examHistory } from './service';

export interface ExamHistoryState {
  /** 'idle' while there is no path. */
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Newest first. */
  entries: ExamHistoryEntry[];
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  reload: () => void;
}

interface Loaded {
  key: string;
  status: 'loading' | 'ready' | 'error';
  entries: ExamHistoryEntry[];
  error: string | null;
}

/** Recent exam attempts of a learning path (default limit 10). */
export function useExamHistory(pathId: string | null, limit = 10): ExamHistoryState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const key = `${userId ?? ''}:${pathId ?? ''}:${limit}`;
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', entries: [], error: null });

  useEffect(() => {
    if (!userId || !pathId) return;
    if (!client) {
      setLoaded({ key, status: 'error', entries: [], error: examErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    setLoaded((prev) => (prev.key === key ? prev : { key, status: 'loading', entries: [], error: null }));
    examHistory(client, pathId, limit)
      .then((entries) => {
        if (active) setLoaded({ key, status: 'ready', entries, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ key, status: 'error', entries: [], error: examErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [client, userId, pathId, limit, key, attempt]);

  if (!pathId) return { status: 'idle', entries: [], error: null, reload };
  const current = loaded.key === key ? loaded : { status: 'loading' as const, entries: [], error: null };
  return { status: current.status, entries: current.entries, error: current.error, reload };
}
