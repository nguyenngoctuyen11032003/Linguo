import { isNetworkError } from '@/lib/network-error';
import type { DownloadOutcome } from './offline-context';
import type { DownloadResult } from './pack-service';

export function isRateLimited(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'message' in error && (error as { message?: unknown }).message === 'rate_limited';
}

/** How a finished download should be reported to the learner. */
export function outcomeOf(result: DownloadResult | null, aborted: boolean): DownloadOutcome {
  if (!result) return 'error';
  if (aborted || result.aborted) return 'cancelled';
  if (result.quotaExceeded) return 'quota';
  if (result.error) return isRateLimited(result.error) ? 'rate_limited' : isNetworkError(result.error) ? 'offline' : 'error';
  return result.failed.length > 0 ? 'partial' : 'done';
}
