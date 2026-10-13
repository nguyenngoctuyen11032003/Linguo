// placeholder: replaced by Task D6
// Minimal stand-in so the D8 entry points (Home card, onboarding, settings) build and run before D6 lands.
import { useEffect, useReducer, useState } from 'react';
import { diagnosticStatusSchema, type DiagnosticStatus } from '@linguo/shared';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { callRpc, parse } from '@/features/lesson-player/service';
import { getSupabase } from '@/lib/supabase';

export interface DiagnosticStatusState {
  status: 'loading' | 'ready' | 'error';
  data: DiagnosticStatus | null;
  reload: () => void;
}

export function useDiagnosticStatus(pathId?: string): DiagnosticStatusState {
  const { currentId } = useLearningPaths();
  const path = pathId ?? currentId;
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const [loaded, setLoaded] = useState<{ key: string; status: DiagnosticStatusState['status']; data: DiagnosticStatus | null }>({
    key: '',
    status: 'loading',
    data: null,
  });
  const key = `${path ?? ''}:${attempt}`;

  useEffect(() => {
    if (!client || !path) return;
    let active = true;
    callRpc(client, 'diagnostic_status', { p_path_id: path })
      .then((data) => {
        if (active) setLoaded({ key, status: 'ready', data: parse(diagnosticStatusSchema, data) });
      })
      .catch(() => {
        if (active) setLoaded({ key, status: 'error', data: null });
      });
    return () => {
      active = false;
    };
  }, [client, path, key]);

  if (!client) return { status: 'error', data: null, reload };
  return loaded.key === key ? { status: loaded.status, data: loaded.data, reload } : { status: 'loading', data: null, reload };
}
