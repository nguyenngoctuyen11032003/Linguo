import { useEffect, useReducer, useState } from 'react';
import type { ExamResult } from '@linguo/shared';
import { examErrorMessage } from '@/features/exam/error-map';
import { getExamAttempt } from '@/features/exam/service';
import { getSupabase } from '@/lib/supabase';

export type ExamResultState =
  | { status: 'loading'; result: null; error: null; reload(): void }
  | { status: 'ready'; result: ExamResult; error: null; reload(): void }
  /** The attempt is still open: the page sends the learner back to the runner. */
  | { status: 'in_progress'; result: null; error: null; reload(): void }
  | { status: 'error'; result: null; error: string; reload(): void };

type Loaded =
  | { key: string; status: 'loading' | 'in_progress'; result: null; error: null }
  | { key: string; status: 'ready'; result: ExamResult; error: null }
  | { key: string; status: 'error'; result: null; error: string };

/**
 * The graded result of an attempt. `initial` (handed over by the runner in the navigation state) is used as is
 * when it belongs to the attempt; otherwise get_exam_attempt is asked, which returns the stored result.
 */
export function useExamResult(attemptId: string, initial: ExamResult | null): ExamResultState {
  const client = getSupabase();
  const [attempt, reload] = useReducer((n: number) => n + 1, 0);
  const handedOver = initial && initial.attempt_id === attemptId ? initial : null;
  const hasHandedOver = handedOver !== null;
  const key = `${attemptId}:${attempt}`;
  const [loaded, setLoaded] = useState<Loaded>({ key, status: 'loading', result: null, error: null });

  useEffect(() => {
    if (hasHandedOver && attempt === 0) return;
    if (!client) {
      setLoaded({ key, status: 'error', result: null, error: examErrorMessage(new Error('supabase_unavailable')) });
      return;
    }
    let active = true;
    setLoaded({ key, status: 'loading', result: null, error: null });
    getExamAttempt(client, attemptId)
      .then((state) => {
        if (!active) return;
        if (state.kind === 'result') setLoaded({ key, status: 'ready', result: state.result, error: null });
        else setLoaded({ key, status: 'in_progress', result: null, error: null });
      })
      .catch((e: unknown) => {
        if (active) setLoaded({ key, status: 'error', result: null, error: examErrorMessage(e) });
      });
    return () => {
      active = false;
    };
  }, [client, attemptId, attempt, key, hasHandedOver]);

  if (handedOver && attempt === 0) return { status: 'ready', result: handedOver, error: null, reload };
  if (loaded.key !== key) return { status: 'loading', result: null, error: null, reload };
  return { ...loaded, reload } as ExamResultState;
}
