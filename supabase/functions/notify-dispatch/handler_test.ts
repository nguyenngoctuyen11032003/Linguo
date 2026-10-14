import assert from 'node:assert/strict';
import {
  type DbError,
  type DbResult,
  type DispatchDb,
  type DispatchDeps,
  handle,
  MAX_PUSH_FAILURES,
  type PushOutcome,
  type PushPayload,
  type PushTarget,
  timingSafeEqual,
  type VapidConfig,
} from './handler.ts';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const NOW = Date.UTC(2026, 9, 14, 12, 30, 0);
const SECRET = 'a'.repeat(64);
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const NOTE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOTE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const VAPID_ENV = {
  VAPID_PUBLIC_KEY: 'public-key',
  VAPID_PRIVATE_KEY: 'private-key',
  VAPID_SUBJECT: 'mailto:ops@example.com',
};

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; failure_count: number };

const due = (notification_id: string, user_id: string) => ({
  notification_id,
  user_id,
  title: 'Ôn bài 5 phút nhé',
  body: 'Có 12 thẻ đang chờ — ôn 5 phút là đủ',
  url: '/app/on-tap',
});

const sub = (id: string, user_id: string, failure_count = 0): Sub => ({
  id,
  user_id,
  endpoint: `https://push.example.com/${id}`,
  p256dh: `p256dh-${id}`,
  auth: `auth-${id}`,
  failure_count,
});

interface FakeDb extends DispatchDb {
  subs: Map<string, Sub>;
  delivered: Map<string, string>;
  successAt: Map<string, string>;
  calls: string[];
  generateArgs: string[];
}

function fakeDb(o: { rows?: unknown; subs?: Sub[]; generateError?: boolean } = {}): FakeDb {
  const ok = { error: null as DbError | null };
  const db: FakeDb = {
    subs: new Map((o.subs ?? []).map((s) => [s.id, { ...s }])),
    delivered: new Map(),
    successAt: new Map(),
    calls: [],
    generateArgs: [],
    generateDue(nowIso: string): Promise<DbResult> {
      db.calls.push('generateDue');
      db.generateArgs.push(nowIso);
      return Promise.resolve(o.generateError ? { data: null, error: { message: 'boom' } } : { data: o.rows ?? [], error: null });
    },
    subscriptionsFor(userIds: string[]): Promise<DbResult> {
      db.calls.push('subscriptionsFor');
      return Promise.resolve({ data: [...db.subs.values()].filter((s) => userIds.includes(s.user_id)), error: null });
    },
    deleteSubscription(id: string) {
      db.calls.push(`delete:${id}`);
      db.subs.delete(id);
      return Promise.resolve(ok);
    },
    updateSubscription(id: string, patch: { failure_count: number; last_success_at?: string }) {
      db.calls.push(`update:${id}`);
      const s = db.subs.get(id);
      if (s) s.failure_count = patch.failure_count;
      if (patch.last_success_at) db.successAt.set(id, patch.last_success_at);
      return Promise.resolve(ok);
    },
    markDelivered(ids: string[], atIso: string) {
      db.calls.push('markDelivered');
      for (const id of ids) db.delivered.set(id, atIso);
      return Promise.resolve(ok);
    },
  };
  return db;
}

type Sent = { target: PushTarget; payload: PushPayload; vapid: VapidConfig };

/** Push sender returning a fixed status per subscription endpoint (default 201). `throw` simulates a local error. */
function fakeSender(byEndpoint: Record<string, number | null | 'throw'> = {}) {
  const sent: Sent[] = [];
  const send = (target: PushTarget, payload: PushPayload, vapid: VapidConfig): Promise<PushOutcome> => {
    sent.push({ target, payload, vapid });
    const s = byEndpoint[target.endpoint];
    if (s === 'throw') return Promise.reject(new Error('bad key'));
    return Promise.resolve({ status: s === undefined ? 201 : s });
  };
  return { sent, send };
}

function harness(
  o: { env?: Record<string, string>; db?: FakeDb; sender?: ReturnType<typeof fakeSender>; vapidValid?: boolean } = {},
) {
  const env: Record<string, string> = { NOTIFY_CRON_SECRET: SECRET, ...VAPID_ENV, ...o.env };
  const db = o.db ?? fakeDb();
  const sender = o.sender ?? fakeSender();
  const logs: string[] = [];
  const deps: DispatchDeps = {
    env: (k) => env[k],
    now: () => NOW,
    db,
    sendPush: sender.send,
    vapidValid: () => Promise.resolve(o.vapidValid ?? true),
    log: (m) => logs.push(m),
  };
  return { deps, db, sender, logs };
}

function post(authorization: string | null = `Bearer ${SECRET}`, method = 'POST'): Request {
  const headers: Record<string, string> = {};
  if (authorization !== null) headers.authorization = authorization;
  return new Request('http://localhost/functions/v1/notify-dispatch', { method, headers });
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return await res.json();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

Deno.test('wrong, missing or non-Bearer secret → 401 and no database work', async () => {
  for (const auth of [null, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`, SECRET, `bearer ${SECRET}`, `Bearer  ${SECRET}`]) {
    const h = harness();
    const res = await handle(post(auth), h.deps);
    assert.equal(res.status, 401, String(auth));
    assert.deepEqual(await body(res), { error: 'unauthorized' });
    assert.deepEqual(h.db.calls, []);
  }
});

Deno.test('anything but POST → 401, even with the right secret', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const h = harness();
    const res = await handle(post(`Bearer ${SECRET}`, method), h.deps);
    assert.equal(res.status, 401, method);
    assert.deepEqual(h.db.calls, []);
  }
});

Deno.test('unset or short NOTIFY_CRON_SECRET refuses every request (even "Bearer " / matching short value)', async () => {
  for (const secret of ['', 'short']) {
    const h = harness({ env: { NOTIFY_CRON_SECRET: secret } });
    assert.equal((await handle(post(`Bearer ${secret}`), h.deps)).status, 401);
    assert.deepEqual(h.db.calls, []);
  }
});

Deno.test('timingSafeEqual compares exactly', async () => {
  assert.equal(await timingSafeEqual('abc', 'abc'), true);
  assert.equal(await timingSafeEqual('abc', 'abd'), false);
  assert.equal(await timingSafeEqual('abc', 'abcd'), false);
  assert.equal(await timingSafeEqual('', ''), true);
});

// ---------------------------------------------------------------------------
// Generate + push
// ---------------------------------------------------------------------------

Deno.test('calls generate_due_notifications with the current time as ISO', async () => {
  const h = harness();
  const res = await handle(post(), h.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(h.db.generateArgs, [new Date(NOW).toISOString()]);
  assert.deepEqual(await body(res), { generated: 0, pushed: 0, failed: 0, removed: 0 });
  assert.deepEqual(h.db.calls, ['generateDue']);
});

Deno.test('RPC error → 500 generate_failed, nothing pushed', async () => {
  const h = harness({ db: fakeDb({ generateError: true }) });
  const res = await handle(post(), h.deps);
  assert.equal(res.status, 500);
  assert.deepEqual(await body(res), { error: 'generate_failed' });
  assert.equal(h.sender.sent.length, 0);
});

Deno.test('missing VAPID env → push skipped, still 200 with counts', async () => {
  for (const missing of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
    const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A)] });
    const h = harness({ db, env: { [missing]: '' } });
    const res = await handle(post(), h.deps);
    assert.equal(res.status, 200, missing);
    assert.deepEqual(await body(res), { generated: 1, pushed: 0, failed: 0, removed: 0 });
    assert.equal(h.sender.sent.length, 0);
    assert.deepEqual(db.calls, ['generateDue']);
  }
});

Deno.test('invalid or mismatched VAPID keys → push skipped, subscriptions untouched, still 200', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A, 4)] });
  const h = harness({ db, vapidValid: false });
  const res = await handle(post(), h.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await body(res), { generated: 1, pushed: 0, failed: 0, removed: 0 });
  assert.equal(h.sender.sent.length, 0);
  assert.deepEqual(db.calls, ['generateDue']);
  assert.match(h.logs.join('\n'), /VAPID keys invalid/);
});

Deno.test('success → payload is title/body/url only, last_success_at and delivered_push_at updated', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A), due(NOTE_B, USER_B)], subs: [sub('s1', USER_A, 2), sub('s2', USER_B)] });
  const h = harness({ db });
  const res = await handle(post(), h.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await body(res), { generated: 2, pushed: 2, failed: 0, removed: 0 });

  const toA = h.sender.sent.find((s) => s.target.endpoint.endsWith('/s1'))!;
  assert.deepEqual(toA.payload, {
    notification_id: NOTE_A,
    title: 'Ôn bài 5 phút nhé',
    body: 'Có 12 thẻ đang chờ — ôn 5 phút là đủ',
    url: '/app/on-tap',
  });
  assert.deepEqual(toA.target, { endpoint: 'https://push.example.com/s1', p256dh: 'p256dh-s1', auth: 'auth-s1' });
  assert.deepEqual(toA.vapid, { publicKey: 'public-key', privateKey: 'private-key', subject: 'mailto:ops@example.com' });

  const at = new Date(NOW).toISOString();
  assert.equal(db.delivered.get(NOTE_A), at);
  assert.equal(db.delivered.get(NOTE_B), at);
  assert.equal(db.successAt.get('s1'), at);
  assert.equal(db.subs.get('s1')!.failure_count, 0, 'success resets the failure streak');
});

Deno.test('a user with several devices gets one push per device; one success marks the notification delivered', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A), sub('s2', USER_A)] });
  const sender = fakeSender({ 'https://push.example.com/s1': 500 });
  const h = harness({ db, sender });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), { generated: 1, pushed: 1, failed: 1, removed: 0 });
  assert.equal(sender.sent.length, 2);
  assert.ok(db.delivered.has(NOTE_A));
});

Deno.test('410 and 404 → subscription deleted', async () => {
  for (const status of [410, 404]) {
    const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A)] });
    const h = harness({ db, sender: fakeSender({ 'https://push.example.com/s1': status }) });
    const res = await handle(post(), h.deps);
    assert.deepEqual(await body(res), { generated: 1, pushed: 0, failed: 1, removed: 1 }, String(status));
    assert.equal(db.subs.has('s1'), false);
    assert.ok(db.calls.includes('delete:s1'));
    assert.equal(db.delivered.size, 0, 'not delivered');
  }
});

Deno.test('transient error (5xx, 429, network) → failure_count + 1, subscription kept', async () => {
  for (const status of [500, 503, 429, 401, null]) {
    const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A, 1)] });
    const h = harness({ db, sender: fakeSender({ 'https://push.example.com/s1': status }) });
    const res = await handle(post(), h.deps);
    assert.deepEqual(await body(res), { generated: 1, pushed: 0, failed: 1, removed: 0 }, String(status));
    assert.equal(db.subs.get('s1')!.failure_count, 2);
    assert.equal(db.successAt.size, 0);
    assert.equal(db.delivered.size, 0);
  }
});

Deno.test(`failure_count reaching ${MAX_PUSH_FAILURES} → subscription deleted`, async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A, MAX_PUSH_FAILURES - 1)] });
  const h = harness({ db, sender: fakeSender({ 'https://push.example.com/s1': 502 }) });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), { generated: 1, pushed: 0, failed: 1, removed: 1 });
  assert.equal(db.subs.has('s1'), false);
});

Deno.test('local sender error (malformed stored key) → counted as failed, subscription untouched', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A, 3)] });
  const h = harness({ db, sender: fakeSender({ 'https://push.example.com/s1': 'throw' }) });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), { generated: 1, pushed: 0, failed: 1, removed: 0 });
  assert.equal(db.subs.get('s1')!.failure_count, 3);
  assert.deepEqual(db.calls, ['generateDue', 'subscriptionsFor']);
});

Deno.test('malformed due rows are skipped, valid ones still pushed', async () => {
  const rows = [due(NOTE_A, USER_A), { notification_id: 'nope', user_id: USER_B }, null];
  const db = fakeDb({ rows, subs: [sub('s1', USER_A), sub('s2', USER_B)] });
  const h = harness({ db });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), { generated: 1, pushed: 1, failed: 0, removed: 0 });
  assert.equal(h.sender.sent.length, 1);
});

Deno.test('users without subscriptions: generated counts them, nothing pushed', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [] });
  const h = harness({ db });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), { generated: 1, pushed: 0, failed: 0, removed: 0 });
  assert.equal(db.calls.includes('markDelivered'), false);
});

Deno.test('logs never contain endpoints, keys, secrets or notification text', async () => {
  const db = fakeDb({
    rows: [due(NOTE_A, USER_A), due(NOTE_B, USER_B)],
    subs: [sub('s1', USER_A), sub('s2', USER_B)],
  });
  const h = harness({ db, sender: fakeSender({ 'https://push.example.com/s2': 410 }) });
  await handle(post(), h.deps);
  const all = h.logs.join('\n');
  for (const secret of ['push.example.com', 'p256dh-', 'auth-s', 'private-key', 'public-key', SECRET, 'Ôn bài', USER_A]) {
    assert.equal(all.includes(secret), false, secret);
  }
  assert.match(all, /generated=2 pushed=1 failed=1 removed=1/);
});
