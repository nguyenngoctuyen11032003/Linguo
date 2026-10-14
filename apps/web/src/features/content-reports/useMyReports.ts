import { useCallback, useEffect, useState } from 'react';
import type { MyReport } from '@linguo/shared';
import { getSupabase } from '@/lib/supabase';
import { contentReportErrorMessage } from './error-map';
import { listMyReports, MY_REPORTS_DEFAULT_LIMIT } from './service';

export interface MyReportsState {
  status: 'loading' | 'ready' | 'error';
  reports: MyReport[];
  /** Vietnamese message of the last load failure. */
  error: string | null;
  reload: () => void;
}

/** The signed-in learner's content reports, newest first (Settings → "Báo lỗi của tôi"). */
export function useMyReports(limit: number = MY_REPORTS_DEFAULT_LIMIT): MyReportsState {
  const [state, setState] = useState<Omit<MyReportsState, 'reload'>>({ status: 'loading', reports: [], error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setState({ status: 'error', reports: [], error: contentReportErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    listMyReports(client, limit)
      .then((reports) => {
        if (active) setState({ status: 'ready', reports, error: null });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', reports: [], error: contentReportErrorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [limit, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
