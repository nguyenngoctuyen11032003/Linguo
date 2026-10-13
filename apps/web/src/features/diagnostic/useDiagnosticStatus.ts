import { useEffect, useReducer, useState } from 'react';
import type { DiagnosticStatus } from '@linguo/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { diagnosticErrorMessage } from './error-map';
import { diagnosticStatus } from './service';

export interface DiagnosticStatusState {
  status: 'loading' | 'ready' | 'error';
  data: DiagnosticStatus | null;
  /** Vietnamese message when status is 'error'. */
  error: string | null;
  reload: () => void;
}

interface Loaded {
  key: string;
  status: DiagnosticStatusState['status'];
  data: DiagnosticStatus | null;
  error: string | null;
}

/** `diagnostic_status` of a learning path (Home card, settings "Làm lại bài kiểm tra"). */
export function useDiagnosticStatus(pathId: string | null | undefined): DiagnosticStatusState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const key = `${userId ?? ''}:${pathId ?? ''}`;
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', data: null, error: null });

  useEffect(() => {
    if (!userId) return;
    if (!client) {
      setLoaded({ key, status: 'error', data: null, error: diagnosticErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    if (!pathId) {
      setLoaded({ key, status: 'error', data: null, error: diagnosticErrorMessage({ message: 'path_not_found' }) });
      return;
    }
    let active = true;
    // Keep showing the previous status of the same path while refreshing.
    setLoaded((prev) => (prev.key === key ? prev : { key, status: 'loading', data: null, error: null }));
    diagnosticStatus(client, pathId)
      .then((data) => {
        if (active) setLoaded({ key, status: 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ key, status: 'error', data: null, error: diagnosticErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [client, userId, pathId, key, attempt]);

  const current = loaded.key === key ? loaded : { status: 'loading' as const, data: null, error: null };
  return { status: current.status, data: current.data, error: current.error, reload };
}
