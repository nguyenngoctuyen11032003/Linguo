// placeholder: replaced by Task B6
// Type-level stand-in so Task B8 (review screens) typechecks before the review data layer merges.
import type { ReviewSessionApi } from './types';

export function useReviewSession(): ReviewSessionApi {
  const noop = async () => {};
  return {
    status: 'loading',
    error: null,
    totals: null,
    card: null,
    position: 0,
    total: 0,
    cardState: { status: 'front' },
    flip: () => {},
    grade: noop,
    postpone: noop,
    graded: [],
    pendingCount: 0,
    summary: null,
    loadMore: noop,
    retry: () => {},
  };
}
