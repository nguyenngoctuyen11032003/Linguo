import assert from 'node:assert/strict';
import {
  backoffMs,
  buildRequestBody,
  callGemini,
  GEMINI_BASE_URL,
  type GeminiCall,
  type GeminiDeps,
  GeminiError,
  isDailyQuota,
  parseRetryAfter,
  responseText,
} from './gemini.ts';

const KEY = 'AIza-secret-test-key';

const baseCall = (over: Partial<GeminiCall> = {}): GeminiCall => ({
  apiKey: KEY,
  model: 'gemini-test',
  system: 'SYSTEM',
  user: 'USER',
  responseSchema: { type: 'OBJECT', properties: { a: { type: 'STRING' } } },
  maxOutputTokens: 1200,
  temperature: 0.3,
  timeoutMs: 20_000,
  deadlineMs: 45_000,
  ...over,
});

const ok = (text = '{"a":"x"}') =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }), {
    status: 200,
  });
const err = (status: number, body: unknown = { error: { message: 'boom' } }, headers?: HeadersInit) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });

type Step = Response | Error | ((init: RequestInit) => Promise<Response>);

interface Harness {
  deps: GeminiDeps;
  requests: { url: string; init: RequestInit; body: Record<string, unknown> }[];
  sleeps: number[];
  clock: { t: number };
}

function harness(steps: Step[], random = 0.5): Harness {
  const clock = { t: 1_000_000 };
  const requests: Harness['requests'] = [];
  const sleeps: number[] = [];
  const queue = [...steps];
  const deps: GeminiDeps = {
    fetch: ((input: string | URL | Request, init?: RequestInit) => {
      const i = init ?? {};
      requests.push({ url: String(input), init: i, body: JSON.parse(String(i.body)) });
      const step = queue.shift();
      if (!step) throw new Error('unexpected fetch');
      if (step instanceof Response) return Promise.resolve(step);
      if (step instanceof Error) return Promise.reject(step);
      return step(i);
    }) as typeof fetch,
    now: () => clock.t,
    random: () => random,
    sleep: (ms) => {
      sleeps.push(ms);
      clock.t += ms;
      return Promise.resolve();
    },
  };
  return { deps, requests, sleeps, clock };
}

async function rejects(p: Promise<unknown>): Promise<GeminiError> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof GeminiError, `expected GeminiError, got ${e}`);
    return e;
  }
  throw new Error('expected rejection');
}

Deno.test('success: url, key header, body shape', async () => {
  const h = harness([ok()]);
  const res = await callGemini(baseCall(), h.deps);
  assert.deepEqual(res, { text: '{"a":"x"}', attempts: 1, usedSchema: true });
  const [r] = h.requests;
  assert.equal(r.url, `${GEMINI_BASE_URL}/gemini-test:generateContent`);
  assert.ok(!r.url.includes(KEY));
  assert.equal(r.init.method, 'POST');
  const headers = new Headers(r.init.headers);
  assert.equal(headers.get('x-goog-api-key'), KEY);
  assert.equal(headers.get('content-type'), 'application/json');
  assert.ok(r.init.signal instanceof AbortSignal);
  assert.deepEqual(r.body, {
    systemInstruction: { parts: [{ text: 'SYSTEM' }] },
    contents: [{ role: 'user', parts: [{ text: 'USER' }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { a: { type: 'STRING' } } },
      maxOutputTokens: 1200,
      temperature: 0.3,
    },
  });
});

Deno.test('null responseSchema → no responseSchema field, usedSchema false', async () => {
  const h = harness([ok()]);
  const res = await callGemini(baseCall({ responseSchema: null }), h.deps);
  assert.equal(res.usedSchema, false);
  const gc = h.requests[0].body.generationConfig as Record<string, unknown>;
  assert.ok(!('responseSchema' in gc));
  assert.equal(gc.responseMimeType, 'application/json');
});

Deno.test('thought parts are skipped', () => {
  const text = responseText({
    candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: '{"a":1}' }] } }],
  });
  assert.equal(text, '{"a":1}');
});

Deno.test('429 then OK: retries with full-jitter backoff', async () => {
  const h = harness([err(429), ok()], 0.5);
  const res = await callGemini(baseCall(), h.deps);
  assert.equal(res.attempts, 2);
  assert.deepEqual(h.sleeps, [250]); // 0.5 · min(4000, 500·2^0)
});

Deno.test('500 / 503 / network are retried, backoff grows and caps at 4 s', async () => {
  const h = harness([err(500), new TypeError('connection reset'), ok()], 0.999);
  const res = await callGemini(baseCall(), h.deps);
  assert.equal(res.attempts, 3);
  assert.deepEqual(h.sleeps, [499, 999]);
  assert.equal(backoffMs(5, () => 0.999), 3996);
  assert.equal(backoffMs(0, () => 0), 0);

  const h2 = harness([err(503), ok()]);
  assert.equal((await callGemini(baseCall(), h2.deps)).attempts, 2);
});

Deno.test('429 ×3 → rate_limited after 2 retries', async () => {
  const h = harness([err(429), err(429), err(429)]);
  const e = await rejects(callGemini(baseCall(), h.deps));
  assert.equal(e.kind, 'rate_limited');
  assert.equal(e.status, 429);
  assert.equal(e.attempts, 3);
  assert.equal(h.sleeps.length, 2);
});

Deno.test('503 ×3 → unavailable', async () => {
  const h = harness([err(503), err(503), err(503)]);
  const e = await rejects(callGemini(baseCall(), h.deps));
  assert.equal(e.kind, 'unavailable');
  assert.equal(e.attempts, 3);
});

Deno.test('network ×3 → network', async () => {
  const h = harness([new TypeError('x'), new TypeError('x'), new TypeError('x')]);
  const e = await rejects(callGemini(baseCall(), h.deps));
  assert.equal(e.kind, 'network');
  assert.equal(e.status, null);
});

Deno.test('other 5xx (502) → unavailable without retry', async () => {
  const h = harness([err(502)]);
  const e = await rejects(callGemini(baseCall(), h.deps));
  assert.equal(e.kind, 'unavailable');
  assert.equal(e.attempts, 1);
});

Deno.test('Retry-After within the deadline is honoured', async () => {
  const h = harness([err(429, {}, { 'retry-after': '3' }), ok()]);
  await callGemini(baseCall(), h.deps);
  assert.deepEqual(h.sleeps, [3000]);
});

Deno.test('RetryInfo retryDelay in the body is honoured', async () => {
  const body = { error: { status: 'RESOURCE_EXHAUSTED', details: [{ retryDelay: '2s' }] } };
  const h = harness([err(429, body), ok()]);
  await callGemini(baseCall(), h.deps);
  assert.deepEqual(h.sleeps, [2000]);
});

Deno.test('Retry-After beyond the deadline → give up without sleeping', async () => {
  const h = harness([err(429, {}, { 'retry-after': '60' })]);
  const e = await rejects(callGemini(baseCall(), h.deps));
  assert.equal(e.kind, 'rate_limited');
  assert.equal(e.attempts, 1);
  assert.deepEqual(h.sleeps, []);
});

Deno.test('backoff that would overrun the deadline is not attempted', async () => {
  const h = harness([err(503)], 0.9);
  const e = await rejects(callGemini(baseCall({ deadlineMs: 300 }), h.deps));
  assert.equal(e.kind, 'unavailable');
  assert.equal(e.attempts, 1);
  assert.deepEqual(h.sleeps, []);
});

Deno.test('daily quota 429 → daily_quota, no retry', async () => {
  const perDay = {
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'You exceeded your current quota.',
      details: [{
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
      }],
    },
  };
  const h = harness([err(429, perDay)]);
  const e = await rejects(callGemini(baseCall(), h.deps));
  assert.equal(e.kind, 'daily_quota');
  assert.equal(e.attempts, 1);
  assert.deepEqual(h.sleeps, []);

  assert.ok(isDailyQuota('Quota exceeded: requests per day'));
  assert.ok(!isDailyQuota('{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}'));
});

Deno.test('400 schema → one retry without responseSchema', async () => {
  const h = harness([err(400, { error: { message: 'Invalid JSON payload: response_schema unknown field' } }), ok()]);
  const res = await callGemini(baseCall(), h.deps);
  assert.deepEqual(res, { text: '{"a":"x"}', attempts: 2, usedSchema: false });
  assert.ok('responseSchema' in (h.requests[0].body.generationConfig as object));
  assert.ok(!('responseSchema' in (h.requests[1].body.generationConfig as object)));
  assert.deepEqual(h.sleeps, []);
});

Deno.test('400 schema without a schema to drop → schema_rejected', async () => {
  const h = harness([err(400, { error: { message: 'bad schema' } })]);
  const e = await rejects(callGemini(baseCall({ responseSchema: null }), h.deps));
  assert.equal(e.kind, 'schema_rejected');
  assert.equal(e.status, 400);
});

Deno.test('400 schema twice → schema_rejected after the fallback', async () => {
  const h = harness([err(400, 'schema'), err(400, 'schema')]);
  const e = await rejects(callGemini(baseCall(), h.deps));
  assert.equal(e.kind, 'schema_rejected');
  assert.equal(e.attempts, 2);
});

Deno.test('other 400 / 403 → bad_request, no retry', async () => {
  const h = harness([err(400, { error: { message: 'API key not valid' } })]);
  const e = await rejects(callGemini(baseCall(), h.deps));
  assert.equal(e.kind, 'bad_request');
  assert.equal(e.attempts, 1);
  const h2 = harness([err(403)]);
  assert.equal((await rejects(callGemini(baseCall(), h2.deps))).kind, 'bad_request');
});

Deno.test('safety block / no candidates / empty text → blocked', async () => {
  const bodies = [
    { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [] },
    {},
    { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: '{}' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '  ' }] } }] },
  ];
  for (const b of bodies) {
    const h = harness([new Response(JSON.stringify(b), { status: 200 })]);
    const e = await rejects(callGemini(baseCall(), h.deps));
    assert.equal(e.kind, 'blocked', JSON.stringify(b));
    assert.equal(e.attempts, 1);
  }
});

Deno.test('unparsable 200 body → unavailable', async () => {
  const h = harness([new Response('<html>', { status: 200 })]);
  assert.equal((await rejects(callGemini(baseCall(), h.deps))).kind, 'unavailable');
});

Deno.test('per-attempt timeout aborts the fetch → timeout, not retried', async () => {
  const hang = (init: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  const h = harness([hang]);
  const e = await rejects(callGemini(baseCall({ timeoutMs: 20 }), h.deps));
  assert.equal(e.kind, 'timeout');
  assert.equal(e.attempts, 1);
});

Deno.test('attempt timeout is capped by the remaining deadline', async () => {
  let aborted = false;
  const started = Date.now();
  const hang = (init: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  const h = harness([hang]);
  const e = await rejects(callGemini(baseCall({ timeoutMs: 60_000, deadlineMs: 30 }), h.deps));
  assert.equal(e.kind, 'timeout');
  assert.ok(aborted);
  assert.ok(Date.now() - started < 5_000);
});

Deno.test('the API key never appears in errors', async () => {
  const cases: Step[][] = [[err(400, `bad key ${KEY}`)], [err(429, 'per day')], [new TypeError(KEY)]];
  for (const steps of cases) {
    const h = harness([...steps, ...steps, ...steps]);
    const e = await rejects(callGemini(baseCall(), h.deps));
    assert.ok(!e.message.includes(KEY));
    assert.ok(!String(e.stack).includes(KEY));
    assert.ok(!JSON.stringify(e).includes(KEY));
  }
});

Deno.test('helpers: parseRetryAfter, buildRequestBody', () => {
  assert.equal(parseRetryAfter(null, 0), null);
  assert.equal(parseRetryAfter('2', 0), 2000);
  assert.equal(parseRetryAfter('garbage', 0), null);
  const now = Date.parse('2026-10-13T00:00:00Z');
  assert.equal(parseRetryAfter('Tue, 13 Oct 2026 00:00:05 GMT', now), 5000);
  const b = buildRequestBody(baseCall(), false);
  assert.ok(!('responseSchema' in (b.generationConfig as object)));
});
