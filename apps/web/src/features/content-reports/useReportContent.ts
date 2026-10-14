import { useCallback, useRef, useState } from 'react';
import type { ReportContentResult } from '@linguo/shared';
import { getSupabase } from '@/lib/supabase';
import { contentReportErrorMessage } from './error-map';
import { reportContent, type ReportContentInput } from './service';

export type ReportContentStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface ReportContentState {
  status: ReportContentStatus;
  result: ReportContentResult | null;
  /** Vietnamese message of the last failure. */
  error: string | null;
  /** Sends the report; resolves with the result, or null on failure (never rejects). Ignored while one is in flight. */
  submit: (input: ReportContentInput) => Promise<ReportContentResult | null>;
  /** Back to idle, e.g. when the dialog closes. */
  reset: () => void;
}

/** One learner content report (spec 11 §2): report_content with Vietnamese errors. */
export function useReportContent(): ReportContentState {
  const [state, setState] = useState<Pick<ReportContentState, 'status' | 'result' | 'error'>>({
    status: 'idle',
    result: null,
    error: null,
  });
  const inFlight = useRef(false);
  // Bumped by reset(): an answer arriving after the dialog closed must not reopen a stale state.
  const generation = useRef(0);

  const submit = useCallback(async (input: ReportContentInput) => {
    if (inFlight.current) return null;
    const client = getSupabase();
    if (!client) {
      setState({ status: 'error', result: null, error: contentReportErrorMessage(new Error('supabase_unavailable')) });
      return null;
    }
    inFlight.current = true;
    const gen = generation.current;
    setState({ status: 'submitting', result: null, error: null });
    try {
      const result = await reportContent(client, input);
      if (gen === generation.current) setState({ status: 'success', result, error: null });
      return result;
    } catch (error) {
      if (gen === generation.current) setState({ status: 'error', result: null, error: contentReportErrorMessage(error) });
      return null;
    } finally {
      inFlight.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    generation.current += 1;
    inFlight.current = false;
    setState({ status: 'idle', result: null, error: null });
  }, []);

  return { ...state, submit, reset };
}
