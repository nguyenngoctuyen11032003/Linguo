// Gemini generateContent client (spec 5 §3 step 9). Pure apart from the injected deps, so every
// retry / timeout / quota path is unit-tested with a fake fetch and clock. Never logs: callers log
// `kind` / `status` only. The API key travels in the `x-goog-api-key` header, never in the URL or
// in an error message.

export type GeminiErrorKind =
  | 'timeout'
  | 'rate_limited'
  | 'daily_quota'
  | 'unavailable'
  | 'bad_request'
  | 'schema_rejected'
  | 'blocked'
  | 'network';

export class GeminiError extends Error {
  kind: GeminiErrorKind;
  status: number | null;
  attempts: number;

  constructor(kind: GeminiErrorKind, status: number | null, attempts: number) {
    super(`gemini ${kind}${status === null ? '' : ` (${status})`} after ${attempts} attempt(s)`);
    this.name = 'GeminiError';
    this.kind = kind;
    this.status = status;
    this.attempts = attempts;
  }
}

export interface GeminiDeps {
  fetch: typeof fetch;
  now: () => number;
  random: () => number;
  sleep: (ms: number) => Promise<void>;
}

export interface GeminiCall {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  responseSchema: Record<string, unknown> | null;
  maxOutputTokens: number;
  temperature: number;
  /** Per-attempt timeout (ms). */
  timeoutMs: number;
  /** Overall budget (ms) for all attempts, backoffs and the schema fallback. */
  deadlineMs: number;
}

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
/** Retries after the first attempt for 429 / 500 / 503 / network errors. */
export const MAX_RETRIES = 2;
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_CAP_MS = 4_000;
/** Attempts shorter than this are not worth starting. */
const MIN_ATTEMPT_MS = 250;

const RETRYABLE_STATUS = new Set([429, 500, 503]);
const BLOCK_FINISH_REASONS = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
  'IMAGE_SAFETY',
]);

/** Full jitter: rand(0, min(cap, base·2^n)), n = retry index starting at 0. */
export function backoffMs(retry: number, random: () => number): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** retry);
  return Math.floor(random() * ceiling);
}

/** `Retry-After` as seconds or an HTTP date → ms from `now`; null when absent / unparsable. */
export function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) * 1000);
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/**
 * A 429 caused by the per-day quota (retrying today is pointless): the message says "per day" or
 * the RESOURCE_EXHAUSTED QuotaFailure names a daily quotaId ("GenerateRequestsPerDay…").
 */
export function isDailyQuota(body: string): boolean {
  return /per[\s_-]?day/i.test(body);
}

/** google.rpc.RetryInfo `"retryDelay": "36s"` in an error body → ms; null when absent. */
export function parseRetryDelay(body: string): number | null {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  return m ? Math.round(Number(m[1]) * 1000) : null;
}

/** A 400 whose message blames the response schema / generationConfig. */
export function isSchemaRejection(body: string): boolean {
  return /schema/i.test(body);
}

export function buildRequestBody(call: GeminiCall, withSchema: boolean): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: call.system }] },
    contents: [{ role: 'user', parts: [{ text: call.user }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      ...(withSchema && call.responseSchema ? { responseSchema: call.responseSchema } : {}),
      maxOutputTokens: call.maxOutputTokens,
      temperature: call.temperature,
    },
  };
}

type Candidate = { content?: { parts?: unknown }; finishReason?: unknown };
type GenerateResponse = { candidates?: Candidate[]; promptFeedback?: { blockReason?: unknown } };

/** Text of the first candidate, or null when the answer was blocked / missing. */
export function responseText(res: unknown): string | null {
  const r = res as GenerateResponse | null;
  if (!r || typeof r !== 'object') return null;
  if (r.promptFeedback?.blockReason) return null;
  const first = Array.isArray(r.candidates) ? r.candidates[0] : undefined;
  if (!first) return null;
  if (typeof first.finishReason === 'string' && BLOCK_FINISH_REASONS.has(first.finishReason)) return null;
  const parts = first.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .filter((p) => p && typeof p === 'object' && !(p as { thought?: unknown }).thought)
    .map((p) => String((p as { text?: unknown }).text ?? ''))
    .join('');
  return text.trim() ? text : null;
}

type Attempt =
  | { ok: true; text: string }
  | { ok: false; kind: GeminiErrorKind; status: number | null; retryable: boolean; retryAfterMs: number | null };

async function attempt(
  call: GeminiCall,
  deps: GeminiDeps,
  withSchema: boolean,
  timeoutMs: number,
): Promise<Attempt> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await deps.fetch(`${GEMINI_BASE_URL}/${encodeURIComponent(call.model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': call.apiKey },
        body: JSON.stringify(buildRequestBody(call, withSchema)),
        signal: ctrl.signal,
      });
    } catch {
      return ctrl.signal.aborted
        ? { ok: false, kind: 'timeout', status: null, retryable: false, retryAfterMs: null }
        : { ok: false, kind: 'network', status: null, retryable: true, retryAfterMs: null };
    }

    let body: string;
    try {
      body = await res.text();
    } catch {
      return ctrl.signal.aborted
        ? { ok: false, kind: 'timeout', status: res.status, retryable: false, retryAfterMs: null }
        : { ok: false, kind: 'network', status: res.status, retryable: true, retryAfterMs: null };
    }

    if (!res.ok) {
      const status = res.status;
      const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'), deps.now()) ?? parseRetryDelay(body);
      if (status === 429) {
        return isDailyQuota(body)
          ? { ok: false, kind: 'daily_quota', status, retryable: false, retryAfterMs: null }
          : { ok: false, kind: 'rate_limited', status, retryable: true, retryAfterMs };
      }
      if (status === 400 && isSchemaRejection(body)) {
        return { ok: false, kind: 'schema_rejected', status, retryable: false, retryAfterMs: null };
      }
      if (status >= 500) {
        return { ok: false, kind: 'unavailable', status, retryable: RETRYABLE_STATUS.has(status), retryAfterMs };
      }
      return { ok: false, kind: 'bad_request', status, retryable: false, retryAfterMs: null };
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return { ok: false, kind: 'unavailable', status: res.status, retryable: false, retryAfterMs: null };
    }
    const text = responseText(json);
    return text === null
      ? { ok: false, kind: 'blocked', status: res.status, retryable: false, retryAfterMs: null }
      : { ok: true, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One logical Gemini call: ≤ 2 retries (429 / 500 / 503 / network) with full-jitter backoff or a
 * `Retry-After` that fits the deadline; per-day quota fails fast as `daily_quota`. A 400 blaming
 * the schema is repeated once without `responseSchema` (`usedSchema: false`); if that is not
 * possible (no schema sent, or no time left) the caller sees `schema_rejected`.
 */
export async function callGemini(
  call: GeminiCall,
  deps: GeminiDeps,
): Promise<{ text: string; attempts: number; usedSchema: boolean }> {
  const deadline = deps.now() + call.deadlineMs;
  let withSchema = call.responseSchema !== null;
  let schemaFallbackUsed = false;
  let retries = 0;
  let attempts = 0;

  for (;;) {
    const remaining = deadline - deps.now();
    if (remaining < MIN_ATTEMPT_MS && attempts > 0) {
      // Defensive: callers only reach this after a delay check, but never exceed the budget.
      throw new GeminiError('timeout', null, attempts);
    }
    attempts++;
    const result = await attempt(call, deps, withSchema, Math.max(1, Math.min(call.timeoutMs, remaining)));
    if (result.ok) return { text: result.text, attempts, usedSchema: withSchema };

    if (result.kind === 'schema_rejected' && withSchema && !schemaFallbackUsed) {
      if (deadline - deps.now() >= MIN_ATTEMPT_MS) {
        withSchema = false;
        schemaFallbackUsed = true;
        continue;
      }
    }

    if (!result.retryable || retries >= MAX_RETRIES) {
      throw new GeminiError(result.kind, result.status, attempts);
    }
    const delay = result.retryAfterMs ?? backoffMs(retries, deps.random);
    if (deps.now() + delay + MIN_ATTEMPT_MS > deadline) {
      throw new GeminiError(result.kind, result.status, attempts);
    }
    retries++;
    if (delay > 0) await deps.sleep(delay);
  }
}
