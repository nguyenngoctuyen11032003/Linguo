import type { ReviewQueue } from '@linguo/shared';

/** True when the server still has cards beyond today's cap ("+10 thẻ nữa" makes sense). */
export function hasMoreCards(totals: ReviewQueue['totals'] | null): boolean {
  return !!totals && totals.backlog_remaining + totals.new_available > 0;
}
