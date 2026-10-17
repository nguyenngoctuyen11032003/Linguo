import { isUnansweredError } from './error-map';

/**
 * Server answers that are transient: keep the entry and retry later instead of dropping the learner's answer.
 * `outbox_waiting`: a `complete_lesson` whose answers are still queued (a local precondition, not a server answer).
 */
const RETRYABLE_MESSAGES = new Set(['rate_limited', 'not_authenticated', 'outbox_waiting']);
/** PostgREST JWT errors (expired/invalid token before the session refreshes). */
const RETRYABLE_CODES = new Set(['PGRST301', 'PGRST303']);
/** HTTP statuses (besides timeouts and 5xx) where the server did not grade the answer: unauthorized, too many requests. */
const RETRYABLE_STATUSES = new Set([401, 429]);

/** Transient failures: the entry stays queued (with backoff) instead of being dropped. */
export function isRetryableOutboxError(error: unknown): boolean {
  if (isUnansweredError(error)) return true;
  if (!error || typeof error !== 'object') return false;
  if ('message' in error && typeof error.message === 'string' && RETRYABLE_MESSAGES.has(error.message)) return true;
  if ('code' in error && typeof error.code === 'string' && RETRYABLE_CODES.has(error.code)) return true;
  return 'status' in error && typeof error.status === 'number' && RETRYABLE_STATUSES.has(error.status);
}

export function errorMessageOf(error: unknown): string | null {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : null;
}

/** The server's rate limit window is 10 s; wait a little longer than that before the next try. */
export const RATE_LIMIT_DELAY_MS = 11_000;

export type OutboxFailureKind = 'waiting' | 'rate_limited' | 'retry' | 'permanent';

export function classifyOutboxError(error: unknown): OutboxFailureKind {
  const message = errorMessageOf(error);
  if (message === 'outbox_waiting') return 'waiting';
  if (message === 'rate_limited' || (error && typeof error === 'object' && 'status' in error && error.status === 429)) return 'rate_limited';
  return isRetryableOutboxError(error) ? 'retry' : 'permanent';
}

/** Server refusals that make the whole run unusable: its queued entries can never succeed and are dropped together. */
const RUN_LEVEL_CODES = new Set([
  'lesson_not_found',
  'lesson_not_in_path',
  'path_not_found',
  'exercise_version_mismatch',
  'run_not_active',
  'run_not_found',
  'attempts_incomplete',
]);

export function isRunLevelError(error: unknown): boolean {
  const message = errorMessageOf(error);
  return message !== null && RUN_LEVEL_CODES.has(message);
}
