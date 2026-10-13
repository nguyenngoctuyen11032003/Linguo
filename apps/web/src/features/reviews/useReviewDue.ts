import { useReviewSummary } from './useReviewSummary';

export interface ReviewDue {
  status: 'loading' | 'ready' | 'error';
  /** Cards still to review today on the current path (`review_summary.remaining_today`); 0 until loaded. */
  count: number;
  recoveryMode: boolean;
  error: string | null;
  reload: () => void;
}

/** Home "Ôn tập hôm nay: N thẻ" (spec 3 §6). */
export function useReviewDue(pathId?: string | null): ReviewDue {
  const { status, summary, error, reload } = useReviewSummary(pathId);
  return {
    status,
    count: summary?.remaining_today ?? 0,
    recoveryMode: summary?.recovery_mode ?? false,
    error,
    reload,
  };
}
