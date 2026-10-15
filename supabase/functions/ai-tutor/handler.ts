// Spec 5 §3: the ai-tutor pipeline. Every side effect (network, clock, randomness, sleep, database)
// arrives through `deps`, so handler_test.ts drives the whole flow with fakes.
import { AI_REQUEST_MAX_BYTES, type AiErrorCode, type AiRequest, aiRequestSchema } from '../_shared/ai-contract.ts';
import { callGemini, type GeminiDeps, GeminiError } from './lib/gemini.ts';
import type { createBreaker } from './lib/breaker.ts';
import { clientIp, type IpLimiter } from './lib/ip-limiter.ts';
import { type PromptModule, PROMPTS } from './lib/prompts/index.ts';
import { roleplayScenarioOf } from './lib/prompts/roleplay_turn.ts';
import { extractJson, repairPrompt, sanitizeOutput } from './lib/text.ts';
import { cacheKey } from './lib/cache-key.ts';

export type DbResult = { data: unknown; error: { message: string } | null };

/** The slice of a supabase-js client (created with the caller's Authorization) that the handler uses. */
export interface SupabaseLike {
  auth: { getUser(jwt: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbResult>;
  from(table: string): {
    select(columns: string): { eq(column: string, value: string): { maybeSingle(): PromiseLike<DbResult> } };
  };
}

export interface HandlerDeps extends GeminiDeps {
  env: (k: string) => string | undefined;
  /** User client (caller's Authorization): getUser, ai_quota_consume / ai_quota_status, lesson reads under RLS. */
  supabase: (authHeader: string) => SupabaseLike;
  /** service_role client: ai_cache_get / ai_cache_put / ai_usage_log / ai_quota_refund only. */
  serviceSupabase: () => SupabaseLike;
  breaker: ReturnType<typeof createBreaker>;
  /** Per-IP burst limit (in memory, per isolate), checked before auth and any database work. */
  ipLimiter: IpLimiter;
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

const DEFAULT_DAILY_LIMIT = 20;
/** Ceiling across tasks; each prompt module sets its own (≤ 1200; review_writing and analyze_sentence 2048). */
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
const DEFAULT_TIMEOUT_MS = 20_000;
const TOTAL_BUDGET_MS = 45_000;
const REPAIR_MAX_OUTPUT_TOKENS = 600;
const LESSON_CONTEXT_MAX_CHARS = 1500;

const MESSAGES: Record<AiErrorCode, string> = {
  bad_request: 'Yêu cầu không hợp lệ.',
  unauthorized: 'Bạn cần đăng nhập để dùng gia sư AI.',
  quota_exceeded: 'Bạn đã dùng hết lượt AI hôm nay.',
  ai_unavailable: 'Gia sư AI tạm thời không khả dụng.',
  invalid_output: 'AI chưa trả lời được yêu cầu này. Hãy thử lại sau.',
};

type Quota = { used: number; limit: number; resets_at: string };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function fail(status: number, code: AiErrorCode, extra: { retryAfterSec?: number | null; quota?: Quota | null } = {}) {
  return json(status, {
    error: code,
    message: MESSAGES[code],
    retry_after_sec: extra.retryAfterSec ?? null,
    quota: extra.quota ?? null,
  });
}

function intEnv(deps: HandlerDeps, name: string, fallback: number, min: number, max: number): number {
  const raw = deps.env(name)?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** Reads the body, refusing anything over AI_REQUEST_MAX_BYTES (also when Content-Length lies or is absent). */
async function readLimited(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > AI_REQUEST_MAX_BYTES) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > AI_REQUEST_MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Number of learner-typed characters (logged as a size only, never the text). */
function inputChars(req: AiRequest): number {
  switch (req.task) {
    case 'explain_concept':
      return req.concept.length + (req.context?.length ?? 0);
    case 'generate_practice':
      return req.focus?.length ?? 0;
    case 'analyze_error':
      return req.prompt.length + req.expected.length + req.answer.length;
    case 'review_writing':
      return req.prompt.length + req.answer.length;
    case 'analyze_sentence':
      return req.sentence.length;
    case 'summarize_session':
      // Only the size of the compact summary is logged, never its content.
      return JSON.stringify([req.activities, req.accuracy_by_stage, req.error_tags]).length;
    case 'plan_review':
      return JSON.stringify(req.gaps).length;
    case 'roleplay_turn':
      // Only sizes: the message and the history lengths, never their text.
      return req.learner_message.length + req.history.reduce((n, t) => n + t.text.length, 0);
  }
}

function localized(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof (v as { vi?: unknown }).vi === 'string') return (v as { vi: string }).vi;
  return '';
}

/** Public, published lesson fields (RLS decides visibility); at most 1.5 KB, no learner data. */
async function lessonContext(db: SupabaseLike, lessonId: string | undefined): Promise<string | null> {
  if (!lessonId) return null;
  try {
    const { data, error } = await db.from('lessons').select('title, objectives, body').eq('id', lessonId).maybeSingle();
    if (error || !data) return null;
    const row = data as { title?: unknown; objectives?: unknown; body?: unknown };
    const parts: string[] = [];
    const title = localized(row.title);
    if (title) parts.push(`Bài: ${title}`);
    const objectives = Array.isArray(row.objectives) ? row.objectives.map(localized).filter(Boolean) : [];
    if (objectives.length) parts.push(`Mục tiêu: ${objectives.join('; ')}`);
    const blocks = Array.isArray(row.body) ? row.body : [];
    for (const type of ['explain', 'deep_explain']) {
      for (const b of blocks) {
        if (b && typeof b === 'object' && (b as { type?: unknown }).type === type) {
          const text = localized((b as { text?: unknown }).text);
          if (text) parts.push(text);
        }
      }
    }
    const text = parts.join('\n').slice(0, LESSON_CONTEXT_MAX_CHARS).trim();
    return text || null;
  } catch {
    return null;
  }
}

function parseQuota(data: unknown, limit: number): (Quota & { allowed: boolean }) | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.allowed !== 'boolean' || typeof d.used !== 'number' || typeof d.resets_at !== 'string') return null;
  return {
    allowed: d.allowed,
    used: d.used,
    limit: typeof d.limit === 'number' ? d.limit : limit,
    resets_at: d.resets_at,
  };
}

class InvalidOutputError extends Error {
  constructor(public attempts: number) {
    super('invalid_output');
  }
}

/** The request enables the task-specific checks (Hangul for ko, review_writing's rubric keys and max_points). */
function tryParse(prompt: PromptModule, text: string, request: AiRequest): { ok: true; data: unknown } | { ok: false } {
  try {
    const v = prompt.validate(extractJson(text), request);
    return v.ok ? { ok: true, data: v.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function handle(req: Request, deps: HandlerDeps): Promise<Response> {
  // 1. Method + size.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return fail(405, 'bad_request');

  // 1b. Per-IP burst limit (spec 7 §3): refused before auth and the daily quota, so nothing is consumed.
  const ipHit = deps.ipLimiter.hit(clientIp(req));
  if (!ipHit.allowed) {
    await req.body?.cancel().catch(() => {});
    return fail(429, 'quota_exceeded', { retryAfterSec: ipHit.retryAfterSec });
  }

  const raw = await readLimited(req);
  if (raw === null) return fail(400, 'bad_request');

  // 2. Strict request contract (model / temperature / system cannot be sent).
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, 'bad_request');
  }
  const parsed = aiRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, 'bad_request');
  const request = parsed.data;
  // The scenario comes from the fixed catalog; an unknown key (or one of the other language) is a bad request.
  if (request.task === 'roleplay_turn' && !roleplayScenarioOf(request)) return fail(400, 'bad_request');

  // 3. Configuration (nothing consumed yet).
  const apiKey = deps.env('GEMINI_API_KEY')?.trim();
  const model = deps.env('GEMINI_MODEL')?.trim();
  if (!apiKey || !model || !deps.env('SUPABASE_SERVICE_ROLE_KEY')?.trim()) return fail(503, 'ai_unavailable');
  const dailyLimit = intEnv(deps, 'GEMINI_DAILY_USER_LIMIT', DEFAULT_DAILY_LIMIT, 1, 1000);
  const maxOutputTokens = intEnv(deps, 'GEMINI_MAX_OUTPUT_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS, 64, 8192);
  const timeoutMs = intEnv(deps, 'GEMINI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 1, TOTAL_BUDGET_MS);

  // 4. Auth: the user id only ever comes from the caller's token.
  const authHeader = req.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(\S+)$/i.exec(authHeader)?.[1];
  if (!token) return fail(401, 'unauthorized');
  const db = deps.supabase(authHeader);
  let userId: string;
  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user?.id) return fail(401, 'unauthorized');
    userId = data.user.id;
  } catch {
    return fail(401, 'unauthorized');
  }
  // Cache, usage log and refund are service_role-only RPCs; user_id is the verified token's id.
  const admin = deps.serviceSupabase();

  const started = deps.now();
  const prompt = PROMPTS[request.task];
  const chars = inputChars(request);

  /** ai_usage row without any content; returns its id (the response_id) or null. */
  const logUsage = async (
    status: 'ok' | AiErrorCode,
    httpStatus: number,
    attempts: number,
    cached: boolean,
    repaired: boolean,
  ): Promise<string | null> => {
    try {
      const { data, error } = await admin.rpc('ai_usage_log', {
        p_user_id: userId,
        p_task: request.task,
        p_prompt_version: prompt.version,
        p_model: model,
        p_status: status,
        p_http_status: httpStatus,
        p_latency_ms: Math.max(0, Math.round(deps.now() - started)),
        p_attempts: attempts,
        p_input_chars: chars,
        p_cached: cached,
        p_repaired: repaired,
      });
      return !error && typeof data === 'string' ? data : null;
    } catch {
      return null;
    }
  };

  const success = (data: unknown, cached: boolean, responseId: string | null, quota: Quota) =>
    json(200, {
      task: request.task,
      prompt_version: prompt.version,
      data,
      cached,
      ai_generated: true,
      response_id: responseId ?? crypto.randomUUID(),
      quota,
    });

  // 5. Lesson context (published fields via RLS).
  const context = await lessonContext(db, 'lesson_id' in request ? request.lesson_id : undefined);

  // 6. Cache: explain_concept, analyze_sentence, plan_review, generate_practice without focus; never analyze_error / review_writing / summarize_session. A hit is free.
  let key: string | null = null;
  if (request.task !== 'analyze_error' && prompt.cacheable(request)) {
    try {
      key = await cacheKey({ promptVersion: prompt.version, model, request });
      const hit = await admin.rpc('ai_cache_get', { p_key: key });
      if (!hit.error && hit.data !== null && hit.data !== undefined) {
        // The request enables the target checks (plan_review ids, analyze_sentence tokens) on a hit too.
        const valid = prompt.validate(hit.data, request);
        if (valid.ok) {
          const quota = await quotaStatus(db, dailyLimit, deps.now());
          const id = await logUsage('ok', 200, 0, true, false);
          return success(sanitizeOutput(valid.data, { language: request.language, maxArrayLength: prompt.maxArrayLength }), true, id, quota);
        }
      }
    } catch {
      // A broken cache never blocks a fresh answer.
    }
  }

  // 7. Circuit breaker.
  if (!deps.breaker.canRequest()) {
    await logUsage('ai_unavailable', 503, 0, false, false);
    return fail(503, 'ai_unavailable', { retryAfterSec: deps.breaker.retryAfterSec() });
  }

  // 8. Daily quota.
  let quota: Quota;
  try {
    const { data, error } = await db.rpc('ai_quota_consume', { p_limit: dailyLimit });
    const q = error ? null : parseQuota(data, dailyLimit);
    if (!q) {
      deps.breaker.releaseProbe();
      return fail(503, 'ai_unavailable');
    }
    quota = { used: q.used, limit: q.limit, resets_at: q.resets_at };
    if (!q.allowed) {
      // No upstream call happens: give back a half-open probe slot claimed by canRequest().
      deps.breaker.releaseProbe();
      await logUsage('quota_exceeded', 429, 0, false, false);
      return fail(429, 'quota_exceeded', { quota });
    }
  } catch {
    deps.breaker.releaseProbe();
    return fail(503, 'ai_unavailable');
  }

  // 9–11. Gemini, validation (+ one repair), sanitising, cache, usage log. 12. Refund on any failure.
  let attempts = 0;
  let repaired = false;
  // callGemini's deadlineMs is a budget in ms; the whole request (incl. repair) stays within 45 s.
  const budgetLeft = () => Math.max(0, started + TOTAL_BUDGET_MS - deps.now());
  try {
    const base = {
      apiKey,
      model,
      system: prompt.buildSystem ? prompt.buildSystem(request) : prompt.system,
      temperature: prompt.temperature,
      timeoutMs,
      responseSchema: prompt.responseSchema,
    };
    const first = await callGemini(
      {
        ...base,
        user: prompt.buildUser(request, { lessonContext: context }),
        deadlineMs: budgetLeft(),
        maxOutputTokens: Math.min(prompt.maxOutputTokens, maxOutputTokens),
      },
      deps,
    );
    attempts += first.attempts;
    deps.breaker.onSuccess();
    let result = tryParse(prompt, first.text, request);
    if (!result.ok) {
      repaired = true;
      const second = await callGemini(
        {
          ...base,
          user: repairPrompt(prompt.responseSchema, first.text),
          deadlineMs: budgetLeft(),
          maxOutputTokens: Math.min(prompt.repairMaxOutputTokens ?? REPAIR_MAX_OUTPUT_TOKENS, maxOutputTokens),
        },
        deps,
      );
      attempts += second.attempts;
      result = tryParse(prompt, second.text, request);
      if (!result.ok) throw new InvalidOutputError(attempts);
    }
    const data = sanitizeOutput(result.data, { language: request.language, maxArrayLength: prompt.maxArrayLength });
    if (key) {
      try {
        // Errors (e.g. 22023 payload_too_large over 16 KB) only skip caching.
        await admin.rpc('ai_cache_put', {
          p_key: key,
          p_task: request.task,
          p_prompt_version: prompt.version,
          p_model: model,
          p_payload: data,
        });
      } catch {
        // Caching is best effort.
      }
    }
    const id = await logUsage('ok', 200, attempts, false, repaired);
    return success(data, false, id, quota);
  } catch (err) {
    let status = 503;
    let code: AiErrorCode = 'ai_unavailable';
    if (err instanceof GeminiError) {
      attempts += err.attempts;
      // The breaker itself decides which kinds reflect upstream health.
      deps.breaker.onFailure(err.kind);
      if (err.kind === 'blocked') {
        status = 502;
        code = 'invalid_output';
      }
    } else if (err instanceof InvalidOutputError) {
      status = 502;
      code = 'invalid_output';
    } else {
      // Unexpected local error before any breaker report: do not leave the probe slot claimed.
      deps.breaker.releaseProbe();
    }
    try {
      await admin.rpc('ai_quota_refund', { p_user_id: userId });
    } catch {
      // The refund is best effort; the quota resets at local midnight anyway.
    }
    await logUsage(code, status, attempts, false, repaired);
    const retryAfterSec = code === 'ai_unavailable' && deps.breaker.state() === 'open' ? deps.breaker.retryAfterSec() : null;
    return fail(status, code, { retryAfterSec });
  }
}

/** Quota for a cache hit (nothing consumed). Falls back to an unknown-usage view if the RPC fails. */
async function quotaStatus(db: SupabaseLike, limit: number, nowMs: number): Promise<Quota> {
  try {
    const { data, error } = await db.rpc('ai_quota_status', { p_limit: limit });
    const d = (data ?? {}) as Record<string, unknown>;
    if (!error && typeof d.used === 'number' && typeof d.resets_at === 'string') {
      return { used: d.used, limit: typeof d.limit === 'number' ? d.limit : limit, resets_at: d.resets_at };
    }
  } catch {
    // fall through
  }
  const next = new Date(nowMs);
  next.setUTCHours(24, 0, 0, 0);
  return { used: 0, limit, resets_at: next.toISOString() };
}
