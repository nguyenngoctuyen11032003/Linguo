import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ExamFamily } from '@linguo/shared';
import { track } from '@/features/analytics';
import { examErrorMessage } from '@/features/exam/error-map';
import { startExam, type StartExamArgs } from '@/features/exam/service';
import { getSupabase } from '@/lib/supabase';
import { examRunnerHref } from './components';
import { examEventProps } from './exam-page-utils';

export interface StartExamState {
  /** A start request is in flight: mode buttons are disabled. */
  busy: boolean;
  /** Vietnamese message of the last failed start. */
  error: string | null;
  start(args: StartExamArgs & { family: ExamFamily }): Promise<void>;
  clearError(): void;
}

/** start_exam, then `exam_started` and the runner. Shared by the hub and the result page ("Luyện dạng này"). */
export function useStartExam(): StartExamState {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const start = useCallback(
    async ({ family, ...args }: StartExamArgs & { family: ExamFamily }) => {
      if (inflight.current) return;
      const client = getSupabase();
      if (!client) {
        setError(examErrorMessage(new Error('supabase_unavailable')));
        return;
      }
      inflight.current = true;
      setBusy(true);
      setError(null);
      try {
        const attempt = await startExam(client, args);
        track('exam_started', examEventProps({ family, mode: attempt.mode, section: attempt.section }));
        navigate(examRunnerHref(attempt.attempt_id));
      } catch (e) {
        setError(examErrorMessage(e));
      } finally {
        inflight.current = false;
        setBusy(false);
      }
    },
    [navigate],
  );

  const clearError = useCallback(() => setError(null), []);
  return { busy, error, start, clearError };
}
