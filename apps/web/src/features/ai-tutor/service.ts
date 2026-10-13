import {
  aiErrorSchema,
  aiRequestSchema,
  aiSuccessSchema,
  type AiError,
  type AiErrorCode,
  type AiRequestInput,
  type AiSuccess,
} from '@linguo/shared';
import type { AppSupabaseClient } from '@/lib/supabase';

// Spec 5 §5. The `ai-tutor` Edge Function answers 200 with `aiSuccessSchema` or 4xx/5xx with `aiErrorSchema`.
// `invokeAiTutor` never throws: every failure (network, timeout, malformed body) becomes an `AiError`.

/** The function itself gives up after 45 s; leave room for the relay before abandoning the request. */
export const AI_TUTOR_TIMEOUT_MS = 50_000;
export const AI_TUTOR_FUNCTION = 'ai-tutor';

export type AiTutorResult = { ok: true; data: AiSuccess } | { ok: false; error: AiError };

/** A locally built error (no server body): no message, retry hint or quota. */
export function localAiError(code: AiErrorCode): AiError {
  return { error: code, message: '', retry_after_sec: null, quota: null };
}

/** Error code inferred from the HTTP status when the body is not an `aiErrorSchema` object. */
function codeForStatus(status: number | null): AiErrorCode {
  if (status === 400 || status === 413 || status === 422) return 'bad_request';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'quota_exceeded';
  return 'ai_unavailable';
}

/** `FunctionsHttpError` / `FunctionsRelayError` carry the fetch `Response` as `context`. */
function responseOf(error: unknown): Response | null {
  if (!error || typeof error !== 'object' || !('context' in error)) return null;
  const context = (error as { context: unknown }).context;
  return typeof Response !== 'undefined' && context instanceof Response ? context : null;
}

async function errorFromFailure(error: unknown): Promise<AiError> {
  const name = error && typeof error === 'object' && 'name' in error ? (error as { name: unknown }).name : null;
  const response = responseOf(error);
  // Network failure, timeout (AbortError wrapped in FunctionsFetchError) or relay failure: never reached the handler.
  if (name !== 'FunctionsHttpError' || !response) return localAiError('ai_unavailable');
  const body: unknown = await response.json().catch(() => null);
  const parsed = aiErrorSchema.safeParse(body);
  return parsed.success ? parsed.data : localAiError(codeForStatus(response.status));
}

export async function invokeAiTutor(client: AppSupabaseClient, request: AiRequestInput): Promise<AiTutorResult> {
  const valid = aiRequestSchema.safeParse(request);
  if (!valid.success) return { ok: false, error: localAiError('bad_request') };
  let result: { data: unknown; error: unknown };
  try {
    result = await client.functions.invoke(AI_TUTOR_FUNCTION, { body: valid.data, timeout: AI_TUTOR_TIMEOUT_MS });
  } catch {
    return { ok: false, error: localAiError('ai_unavailable') };
  }
  if (result.error) return { ok: false, error: await errorFromFailure(result.error) };
  const success = aiSuccessSchema.safeParse(result.data);
  return success.success ? { ok: true, data: success.data } : { ok: false, error: localAiError('invalid_output') };
}
