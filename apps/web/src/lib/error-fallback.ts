/** Shown to learners when a failure has no specific Vietnamese message. Never includes a raw error code. */
export const GENERIC_ERROR_MESSAGE = 'Có lỗi xảy ra. Bạn thử lại sau ít phút nhé.';

/**
 * The learner-facing fallback for an unmapped failure. The raw code stays out of the UI; in development it
 * is logged to the console so a missing mapping is still easy to spot.
 */
export function genericErrorMessage(code?: string | null): string {
  if (code && import.meta.env.DEV) console.debug(`[linguo] unmapped error code: ${code}`);
  return GENERIC_ERROR_MESSAGE;
}
