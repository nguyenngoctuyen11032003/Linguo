// placeholder: replaced by Task B6
// Type-level stand-in so Task B8 (home review card) typechecks before the review data layer merges.
export interface ReviewDue {
  status: 'loading' | 'ready' | 'error';
  count: number;
  reload: () => void;
}

export function useReviewDue(): ReviewDue {
  return { status: 'loading', count: 0, reload: () => {} };
}
