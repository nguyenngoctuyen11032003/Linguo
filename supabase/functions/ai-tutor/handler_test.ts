import assert from 'node:assert/strict';
import { aiErrorSchema, aiSuccessSchema } from '../_shared/ai-contract.ts';
import { type DbResult, handle, type HandlerDeps, type SupabaseLike } from './handler.ts';
import { createBreaker } from './lib/breaker.ts';
import { createIpLimiter } from './lib/ip-limiter.ts';
import { cacheKey, normalizeText } from './lib/cache-key.ts';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const NOW = Date.UTC(2026, 9, 13, 8, 0, 0);
const USER_ID = '11111111-1111-4111-8111-111111111111';
const LESSON_ID = '22222222-2222-4222-8222-222222222222';
const USAGE_ID = '33333333-3333-4333-8333-333333333333';
const RESETS_AT = '2026-10-13T17:00:00.000Z';

type Role = 'user' | 'service';
type RpcCall = { fn: string; args: Record<string, unknown> | undefined; role: Role };

/** Mirrors the grants of migration 20261014000500: who may execute which RPC. */
const RPC_ROLE: Record<string, Role> = {
  ai_quota_consume: 'user',
  ai_quota_status: 'user',
  ai_quota_refund: 'service',
  ai_cache_get: 'service',
  ai_cache_put: 'service',
  ai_usage_log: 'service',
};

interface FakeDb {
  calls: RpcCall[];
  cache: Map<string, unknown>;
  used: number;
  factory: (authHeader: string) => SupabaseLike;
  service: () => SupabaseLike;
  count(fn: string): number;
}

function fakeDb(
  o: { validToken?: boolean; limitReached?: boolean; lesson?: unknown; cachePutError?: boolean } = {},
): FakeDb {
  const client = (role: Role): SupabaseLike => ({
    auth: {
      getUser: (jwt: string) =>
        Promise.resolve(
          role === 'user' && o.validToken !== false && jwt === 'good-token'
            ? { data: { user: { id: USER_ID } }, error: null }
            : { data: { user: null }, error: { message: 'invalid JWT' } },
        ),
    },
    rpc: (fn: string, args?: Record<string, unknown>): Promise<DbResult> => {
      db.calls.push({ fn, args, role });
      if (RPC_ROLE[fn] !== role) return Promise.resolve({ data: null, error: { message: `permission denied for ${fn}` } });
      if (role === 'service' && fn !== 'ai_cache_get' && fn !== 'ai_cache_put') assert.equal(args?.p_user_id, USER_ID);
      switch (fn) {
        case 'ai_quota_consume': {
          const limit = args?.p_limit as number;
          if (o.limitReached || db.used >= limit) {
            return Promise.resolve({ data: { allowed: false, used: db.used, limit, resets_at: RESETS_AT }, error: null });
          }
          db.used++;
          return Promise.resolve({ data: { allowed: true, used: db.used, limit, resets_at: RESETS_AT }, error: null });
        }
        case 'ai_quota_refund':
          db.used--;
          return Promise.resolve({ data: true, error: null });
        case 'ai_quota_status':
          return Promise.resolve({ data: { used: db.used, limit: args?.p_limit, resets_at: RESETS_AT }, error: null });
        case 'ai_cache_get':
          return Promise.resolve({ data: db.cache.get(args?.p_key as string) ?? null, error: null });
        case 'ai_cache_put':
          if (o.cachePutError) return Promise.resolve({ data: null, error: { message: 'payload_too_large' } });
          db.cache.set(args?.p_key as string, args?.p_payload);
          return Promise.resolve({ data: null, error: null });
        case 'ai_usage_log':
          return Promise.resolve({ data: USAGE_ID, error: null });
        default:
          return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
      }
    },
    from: (table: string) => ({
      select: (_columns: string) => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: () => {
            // Lesson context must be read as the user (RLS: published only).
            assert.equal(role, 'user');
            return Promise.resolve({ data: table === 'lessons' && value === LESSON_ID ? o.lesson ?? null : null, error: null });
          },
        }),
      }),
    }),
  });
  const db: FakeDb = {
    calls: [],
    cache: new Map(),
    used: 0,
    count: (fn) => db.calls.filter((c) => c.fn === fn).length,
    factory: (authHeader) => {
      assert.match(authHeader, /^Bearer /);
      return client('user');
    },
    service: () => client('service'),
  };
  return db;
}

type FetchStep = Response | ((init: RequestInit | undefined) => Promise<Response>);

interface FakeFetch {
  fn: typeof fetch;
  bodies: Record<string, unknown>[];
}

function fakeFetch(steps: FetchStep[]): FakeFetch {
  const bodies: Record<string, unknown>[] = [];
  const queue = [...steps];
  const fn = ((_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? '{}')));
    const step = queue.shift();
    if (!step) return Promise.reject(new Error('unexpected fetch'));
    return typeof step === 'function' ? step(init) : Promise.resolve(step);
  }) as typeof fetch;
  return { fn, bodies };
}

const geminiOk = (payload: unknown) =>
  new Response(
    JSON.stringify({
      candidates: [{
        content: { parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] },
        finishReason: 'STOP',
      }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const gemini429 = (perDay = false) =>
  new Response(
    JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: perDay ? 'Quota exceeded for metric: generate_content_free_tier_requests, limit per day' : 'Resource exhausted.',
        details: perDay
          ? [{
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
          }]
          : [],
      },
    }),
    { status: 429, headers: { 'content-type': 'application/json' } },
  );

const EXPLAIN_OUTPUT = {
  summary: 'Thì hiện tại hoàn thành diễn tả trải nghiệm.',
  explanation_md: 'Dùng **have/has + V3** khi nói về trải nghiệm.',
  examples: [{ target: 'I have visited Hue.', vi: 'Tôi đã từng đến Huế.' }],
  common_mistakes: ['Dùng quá khứ đơn với "ever".'],
  confidence: 'high',
  uncertainty: null,
};

const ANALYZE_OUTPUT = {
  verdict: 'incorrect',
  error_type: 'verb_form',
  explanation_md: 'Sau "has" cần dạng V3.',
  corrected: 'She has gone home.',
  tip_vi: 'Ghi nhớ: have/has + V3.',
};

interface Harness {
  deps: HandlerDeps;
  db: FakeDb;
  fetch: FakeFetch;
  sleeps: number[];
}

function harness(
  o: { env?: Record<string, string | undefined>; steps?: FetchStep[]; db?: FakeDb; breaker?: HandlerDeps['breaker'] } = {},
): Harness {
  const env: Record<string, string | undefined> = {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'gemini-test-flash',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ...o.env,
  };
  const db = o.db ?? fakeDb();
  const f = fakeFetch(o.steps ?? []);
  const sleeps: number[] = [];
  const deps: HandlerDeps = {
    env: (k) => env[k],
    fetch: f.fn,
    now: () => NOW,
    random: () => 0.5,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    supabase: db.factory,
    serviceSupabase: db.service,
    breaker: o.breaker ?? createBreaker({ failureThreshold: 5, windowMs: 60_000, openMs: 60_000, now: () => NOW }),
    ipLimiter: createIpLimiter({ limit: 30, windowMs: 60_000, now: () => NOW }),
  };
  return { deps, db, fetch: f, sleeps };
}

const explainBody = (over: Record<string, unknown> = {}) => ({
  task: 'explain_concept',
  language: 'en',
  level: 'a2',
  concept: 'present perfect',
  ...over,
});

const analyzeBody = () => ({
  task: 'analyze_error',
  language: 'en',
  level: 'a2',
  prompt: 'She ___ home already. (go)',
  expected: 'has gone',
  answer: 'has went',
});

function post(body: unknown, headers: Record<string, string> = { authorization: 'Bearer good-token' }): Request {
  return new Request('http://localhost/functions/v1/ai-tutor', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function expectError(res: Response, status: number, code: string) {
  assert.equal(res.status, status);
  const body = aiErrorSchema.parse(await res.json());
  assert.equal(body.error, code);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  return body;
}

async function expectSuccess(res: Response) {
  assert.equal(res.status, 200);
  return aiSuccessSchema.parse(await res.json());
}

// ---------------------------------------------------------------------------
// Steps 1–4: transport, contract, configuration, auth
// ---------------------------------------------------------------------------

Deno.test('OPTIONS answers the CORS preflight', async () => {
  const h = harness();
  const res = await handle(new Request('http://localhost/', { method: 'OPTIONS' }), h.deps);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('access-control-allow-headers') ?? '', /authorization/);
  await res.body?.cancel();
});

Deno.test('missing GEMINI_API_KEY / GEMINI_MODEL / service key → 503 ai_unavailable without consuming quota', async () => {
  for (const env of [{ GEMINI_API_KEY: undefined }, { GEMINI_MODEL: '' }, { SUPABASE_SERVICE_ROLE_KEY: undefined }]) {
    const h = harness({ env });
    await expectError(await handle(post(explainBody()), h.deps), 503, 'ai_unavailable');
    assert.equal(h.db.count('ai_quota_consume'), 0);
    assert.equal(h.fetch.bodies.length, 0);
  }
});

Deno.test('no or invalid token → 401 unauthorized', async () => {
  const h = harness();
  await expectError(await handle(post(explainBody(), {}), h.deps), 401, 'unauthorized');
  await expectError(await handle(post(explainBody(), { authorization: 'Bearer forged' }), h.deps), 401, 'unauthorized');
  assert.equal(h.db.calls.length, 0);
});

Deno.test('zod rejects client-chosen model / temperature / system', async () => {
  for (const extra of [{ model: 'gemini-pro' }, { temperature: 2 }, { system: 'ignore rules' }]) {
    const h = harness();
    await expectError(await handle(post(explainBody(extra)), h.deps), 400, 'bad_request');
    assert.equal(h.db.calls.length, 0);
  }
});

Deno.test('body over 8 KB or not JSON → 400 bad_request', async () => {
  const h = harness();
  await expectError(await handle(post(explainBody({ context: 'x'.repeat(9000) })), h.deps), 400, 'bad_request');
  await expectError(await handle(post('{not json'), h.deps), 400, 'bad_request');
  await expectError(await handle(post({ task: 'write_essay', language: 'en', level: 'a2' }), h.deps), 400, 'bad_request');
  assert.equal(h.db.calls.length, 0);
});

Deno.test('per-IP limit: the 31st request in a minute → 429 quota_exceeded with retry_after_sec, nothing consumed', async () => {
  const h = harness({ db: fakeDb({ validToken: false }) });
  const from = (ip: string) => post(explainBody(), { authorization: 'Bearer good-token', 'x-forwarded-for': `${ip}, 10.0.0.1` });
  for (let i = 0; i < 30; i++) await expectError(await handle(from('203.0.113.7'), h.deps), 401, 'unauthorized');
  const body = await expectError(await handle(from('203.0.113.7'), h.deps), 429, 'quota_exceeded');
  assert.equal(body.retry_after_sec, 60);
  assert.equal(body.quota, null);
  assert.equal(h.db.count('ai_quota_consume'), 0);
  assert.equal(h.fetch.bodies.length, 0);
  // Another address, and requests without x-forwarded-for ('unknown'), still get through.
  await expectError(await handle(from('198.51.100.2'), h.deps), 401, 'unauthorized');
  await expectError(await handle(post(explainBody()), h.deps), 401, 'unauthorized');
});

Deno.test('per-IP limit is checked before the daily quota: a refused request consumes nothing', async () => {
  const h = harness({ env: { GEMINI_DAILY_USER_LIMIT: '100' }, steps: Array.from({ length: 30 }, () => geminiOk(ANALYZE_OUTPUT)) });
  for (let i = 0; i < 30; i++) await expectSuccess(await handle(post(analyzeBody()), h.deps));
  assert.equal(h.db.count('ai_quota_consume'), 30);
  const callsBefore = h.db.calls.length;
  await expectError(await handle(post(analyzeBody()), h.deps), 429, 'quota_exceeded');
  assert.equal(h.db.calls.length, callsBefore);
  assert.equal(h.db.used, 30);
  assert.equal(h.fetch.bodies.length, 30);
});

// ---------------------------------------------------------------------------
// Steps 8–12: quota, Gemini, repair, refund
// ---------------------------------------------------------------------------

Deno.test('success returns the contract shape with quota and response_id', async () => {
  const h = harness({ steps: [geminiOk(EXPLAIN_OUTPUT)] });
  const body = await expectSuccess(await handle(post(explainBody()), h.deps));
  assert.equal(body.cached, false);
  assert.equal(body.ai_generated, true);
  assert.equal(body.response_id, USAGE_ID);
  assert.deepEqual(body.quota, { used: 1, limit: 20, resets_at: RESETS_AT });
  assert.equal((body.data as { summary: string }).summary, EXPLAIN_OUTPUT.summary);
  assert.equal(h.db.count('ai_quota_refund'), 0);
  // Model comes from the secret only.
  assert.equal(h.fetch.bodies.length, 1);
});

Deno.test('GEMINI_DAILY_USER_LIMIT is passed to ai_quota_consume', async () => {
  const h = harness({ env: { GEMINI_DAILY_USER_LIMIT: '7' }, steps: [geminiOk(EXPLAIN_OUTPUT)] });
  const body = await expectSuccess(await handle(post(explainBody()), h.deps));
  assert.equal(h.db.calls.find((c) => c.fn === 'ai_quota_consume')?.args?.p_limit, 7);
  assert.equal(body.quota.limit, 7);
});

Deno.test('quota exhausted → 429 quota_exceeded with resets_at, no Gemini call, no refund', async () => {
  const h = harness({ db: fakeDb({ limitReached: true }) });
  const body = await expectError(await handle(post(analyzeBody()), h.deps), 429, 'quota_exceeded');
  assert.equal(body.quota?.resets_at, RESETS_AT);
  assert.equal(h.fetch.bodies.length, 0);
  assert.equal(h.db.count('ai_quota_refund'), 0);
});

Deno.test('429 → backoff → OK', async () => {
  const h = harness({ steps: [gemini429(), geminiOk(EXPLAIN_OUTPUT)] });
  await expectSuccess(await handle(post(explainBody()), h.deps));
  assert.equal(h.fetch.bodies.length, 2);
  assert.equal(h.sleeps.length, 1);
  assert.equal(h.db.count('ai_quota_consume'), 1);
  assert.equal(h.db.count('ai_quota_refund'), 0);
  const log = h.db.calls.find((c) => c.fn === 'ai_usage_log');
  assert.equal(log?.args?.p_attempts, 2);
  assert.equal(log?.args?.p_status, 'ok');
});

Deno.test('429 ×3 → quota refunded → 503 ai_unavailable', async () => {
  const h = harness({ steps: [gemini429(), gemini429(), gemini429()] });
  await expectError(await handle(post(explainBody()), h.deps), 503, 'ai_unavailable');
  assert.equal(h.fetch.bodies.length, 3);
  assert.equal(h.db.count('ai_quota_consume'), 1);
  assert.equal(h.db.count('ai_quota_refund'), 1);
  assert.equal(h.db.used, 0);
  assert.equal(h.db.cache.size, 0);
});

Deno.test('timeout → quota refunded → 503 ai_unavailable', async () => {
  const hang = (init: RequestInit | undefined) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  const h = harness({ env: { GEMINI_TIMEOUT_MS: '20' }, steps: [hang, hang, hang] });
  await expectError(await handle(post(explainBody()), h.deps), 503, 'ai_unavailable');
  assert.equal(h.db.count('ai_quota_refund'), 1);
  assert.equal(h.db.used, 0);
});

Deno.test('broken JSON → one repair call (≤ 600 tokens) → OK', async () => {
  const h = harness({ steps: [geminiOk('{"summary": "cut off'), geminiOk(EXPLAIN_OUTPUT)] });
  const body = await expectSuccess(await handle(post(explainBody()), h.deps));
  assert.equal((body.data as { summary: string }).summary, EXPLAIN_OUTPUT.summary);
  assert.equal(h.fetch.bodies.length, 2);
  const repairConfig = (h.fetch.bodies[1] as { generationConfig: { maxOutputTokens: number } }).generationConfig;
  assert.ok(repairConfig.maxOutputTokens <= 600);
  const log = h.db.calls.find((c) => c.fn === 'ai_usage_log');
  assert.equal(log?.args?.p_repaired, true);
  assert.equal(h.db.count('ai_quota_refund'), 0);
});

Deno.test('broken twice → 502 invalid_output, quota refunded', async () => {
  const h = harness({ steps: [geminiOk('not json'), geminiOk({ summary: 'missing fields' })] });
  await expectError(await handle(post(explainBody()), h.deps), 502, 'invalid_output');
  assert.equal(h.fetch.bodies.length, 2);
  assert.equal(h.db.count('ai_quota_refund'), 1);
  assert.equal(h.db.cache.size, 0);
  assert.equal(h.db.calls.find((c) => c.fn === 'ai_usage_log')?.args?.p_status, 'invalid_output');
});

Deno.test('safety block → 502 invalid_output, quota refunded', async () => {
  const blocked = new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 });
  const h = harness({ steps: [blocked] });
  await expectError(await handle(post(explainBody()), h.deps), 502, 'invalid_output');
  assert.equal(h.db.count('ai_quota_refund'), 1);
});

Deno.test('daily-quota 429 opens the breaker; the next request is refused without consuming quota', async () => {
  const breaker = createBreaker({ failureThreshold: 5, windowMs: 60_000, openMs: 60_000, now: () => NOW });
  const db = fakeDb();
  const first = harness({ db, breaker, steps: [gemini429(true)] });
  await expectError(await handle(post(explainBody()), first.deps), 503, 'ai_unavailable');
  assert.equal(first.fetch.bodies.length, 1);
  assert.equal(db.count('ai_quota_refund'), 1);

  const second = harness({ db, breaker, steps: [geminiOk(EXPLAIN_OUTPUT)] });
  const body = await expectError(await handle(post(explainBody({ concept: 'past simple' })), second.deps), 503, 'ai_unavailable');
  assert.ok((body.retry_after_sec ?? 0) > 0);
  assert.equal(second.fetch.bodies.length, 0);
  assert.equal(db.count('ai_quota_consume'), 1);
  assert.equal(db.used, 0);
});

// ---------------------------------------------------------------------------
// Step 6: cache
// ---------------------------------------------------------------------------

Deno.test('cache hit (normalised input) is free: cached = true, no quota, no Gemini call', async () => {
  const db = fakeDb();
  const first = harness({ db, steps: [geminiOk(EXPLAIN_OUTPUT)] });
  await expectSuccess(await handle(post(explainBody()), first.deps));
  assert.equal(db.cache.size, 1);

  const second = harness({ db });
  const body = await expectSuccess(await handle(post(explainBody({ concept: '  Present   PERFECT ' })), second.deps));
  assert.equal(body.cached, true);
  assert.equal((body.data as { summary: string }).summary, EXPLAIN_OUTPUT.summary);
  assert.equal(second.fetch.bodies.length, 0);
  assert.equal(db.count('ai_quota_consume'), 1);
  assert.equal(body.quota.used, 1);
  const hitLog = db.calls.filter((c) => c.fn === 'ai_usage_log').at(-1);
  assert.equal(hitLog?.args?.p_cached, true);
});

Deno.test('ai_cache_put failure (payload_too_large) only skips caching', async () => {
  const h = harness({ db: fakeDb({ cachePutError: true }), steps: [geminiOk(EXPLAIN_OUTPUT)] });
  const body = await expectSuccess(await handle(post(explainBody()), h.deps));
  assert.equal(body.cached, false);
  assert.equal(h.db.count('ai_cache_put'), 1);
  assert.equal(h.db.count('ai_quota_refund'), 0);
});

Deno.test('service-only RPCs go through the service client with the token user id', async () => {
  const h = harness({ steps: [gemini429(), gemini429(), gemini429()] });
  await expectError(await handle(post(explainBody()), h.deps), 503, 'ai_unavailable');
  const byFn = Object.fromEntries(h.db.calls.map((c) => [c.fn, c]));
  assert.equal(byFn.ai_quota_consume?.role, 'user');
  assert.equal(byFn.ai_cache_get?.role, 'service');
  assert.deepEqual(byFn.ai_quota_refund?.args, { p_user_id: USER_ID });
  assert.equal(byFn.ai_quota_refund?.role, 'service');
  assert.equal(byFn.ai_usage_log?.args?.p_user_id, USER_ID);
  assert.ok(h.db.calls.every((c) => RPC_ROLE[c.fn] === c.role));
});

Deno.test('generate_practice with focus is not cached', async () => {
  const practice = {
    items: [{ question: 'Pick: I ___ a student.', options: ['am', 'is'], answer: 'am', explanation_vi: 'Chủ ngữ I đi với am.' }],
  };
  const db = fakeDb();
  const h = harness({ db, steps: [geminiOk(practice)] });
  const req = { task: 'generate_practice', language: 'en', level: 'a1', skill: 'grammar', count: 1, focus: 'to be' };
  await expectSuccess(await handle(post(req), h.deps));
  assert.equal(db.count('ai_cache_get'), 0);
  assert.equal(db.count('ai_cache_put'), 0);
});

Deno.test('analyze_error is never cached', async () => {
  const db = fakeDb();
  const h = harness({ db, steps: [geminiOk(ANALYZE_OUTPUT), geminiOk(ANALYZE_OUTPUT)] });
  await expectSuccess(await handle(post(analyzeBody()), h.deps));
  const again = await expectSuccess(await handle(post(analyzeBody()), h.deps));
  assert.equal(again.cached, false);
  assert.equal(h.fetch.bodies.length, 2);
  assert.equal(db.count('ai_cache_get'), 0);
  assert.equal(db.count('ai_cache_put'), 0);
  assert.equal(db.count('ai_quota_consume'), 2);
});

// ---------------------------------------------------------------------------
// Step 5 + 11: context, sanitising, logging
// ---------------------------------------------------------------------------

Deno.test('lesson context (published fields) is sent to the model', async () => {
  const lesson = {
    title: { vi: 'Thì hiện tại hoàn thành' },
    objectives: [{ vi: 'Nói về trải nghiệm' }],
    body: [{ type: 'explain', text: { vi: 'Have/has + V3.' } }],
  };
  const h = harness({ db: fakeDb({ lesson }), steps: [geminiOk(EXPLAIN_OUTPUT)] });
  await expectSuccess(await handle(post(explainBody({ lesson_id: LESSON_ID })), h.deps));
  const sent = JSON.stringify(h.fetch.bodies[0]);
  assert.match(sent, /Thì hiện tại hoàn thành/);
  assert.match(sent, /Have\/has \+ V3/);
});

Deno.test('sanitising strips <script> from the model output', async () => {
  const evil = { ...EXPLAIN_OUTPUT, summary: 'Hello <script>alert(1)</script> world', explanation_md: '<img src=x onerror=alert(1)>Text' };
  const h = harness({ steps: [geminiOk(evil)] });
  const body = await expectSuccess(await handle(post(explainBody()), h.deps));
  const out = JSON.stringify(body.data);
  assert.ok(!/<script/i.test(out), out);
  assert.ok(!/<img/i.test(out), out);
  // The cached copy is the sanitised one.
  assert.ok(![...h.db.cache.values()].some((v) => /<script/i.test(JSON.stringify(v))));
});

Deno.test('usage log never contains learner or model content', async () => {
  const secret = 'my email is learner@example.com and my secret sentence';
  const h = harness({ steps: [geminiOk(EXPLAIN_OUTPUT)] });
  await expectSuccess(await handle(post(explainBody({ concept: secret, context: 'Context sentence ABCDEF' })), h.deps));
  const logs = h.db.calls.filter((c) => c.fn === 'ai_usage_log');
  assert.equal(logs.length, 1);
  const args = logs[0]!.args!;
  assert.deepEqual(Object.keys(args).sort(), [
    'p_attempts',
    'p_cached',
    'p_http_status',
    'p_input_chars',
    'p_latency_ms',
    'p_model',
    'p_prompt_version',
    'p_repaired',
    'p_status',
    'p_task',
    'p_user_id',
  ]);
  const dump = JSON.stringify(args);
  for (const fragment of ['learner@example.com', 'secret sentence', 'ABCDEF', EXPLAIN_OUTPUT.summary]) {
    assert.ok(!dump.includes(fragment), `log leaked "${fragment}"`);
  }
  assert.equal(args.p_input_chars, secret.length + 'Context sentence ABCDEF'.length);
  assert.equal(args.p_model, 'gemini-test-flash');
});

// ---------------------------------------------------------------------------
// lib/cache-key.ts
// ---------------------------------------------------------------------------

Deno.test('cache key: NFKC + trim + collapsed spaces; lower-case only for en', async () => {
  assert.equal(normalizeText('  Ｈello   WORLD ', 'en'), 'hello world');
  assert.equal(normalizeText(' 안녕  Hi ', 'ko'), '안녕 Hi');

  const base = { promptVersion: 'v1', model: 'm' };
  const req = (concept: string, extra: Record<string, unknown> = {}) =>
    ({ task: 'explain_concept', language: 'en', level: 'a2', variant: 'default', concept, ...extra }) as const;
  const a = await cacheKey({ ...base, request: req('Present Perfect') });
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await cacheKey({ ...base, request: req('  present   perfect') }));
  assert.notEqual(a, await cacheKey({ ...base, model: 'other', request: req('Present Perfect') }));
  assert.notEqual(a, await cacheKey({ ...base, promptVersion: 'v2', request: req('Present Perfect') }));
  assert.notEqual(a, await cacheKey({ ...base, request: req('Present Perfect', { variant: 'simpler' }) }));
  assert.notEqual(a, await cacheKey({ ...base, request: req('Present Perfect', { level: 'b1' }) }));
  assert.notEqual(a, await cacheKey({ ...base, request: req('Present Perfect', { lesson_id: LESSON_ID }) }));
});
