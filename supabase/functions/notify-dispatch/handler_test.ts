import assert from 'node:assert/strict';
import {
  DISPATCH_DEADLINE_MS,
  type DbError,
  type DbResult,
  type DispatchDb,
  type DispatchDeps,
  handle,
  MAX_PUSH_FAILURES,
  PENDING_LIMIT,
  type PushOutcome,
  type PushPayload,
  type PushTarget,
  PURGE_UTC_HOUR,
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
const NOTE_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const VAPID_ENV = {
  VAPID_PUBLIC_KEY: 'public-key',
  VAPID_PRIVATE_KEY: 'private-key',
  VAPID_SUBJECT: 'mailto:ops@example.com',
};

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; failure_count: number };

const due = (notification_id: string, user_id: string) => ({
  notification_id,
  user_id,
  title: 'Ôn tập nhanh 5 phút',
  body: 'Có vài thẻ đang chờ bạn ôn nhanh.',
  url: '/app/on-tap',
});

const endpointOf = (id: string) => `https://fcm.googleapis.com/fcm/send/${id}`;

const sub = (id: string, user_id: string, failure_count = 0): Sub => ({
  id,
  user_id,
  endpoint: endpointOf(id),
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
  pendingArgs: Array<{ nowIso: string; limit: number }>;
}

function fakeDb(
  o: {
    /** Rows returned by pending_push_notifications. */
    rows?: unknown;
    /** Rows returned by generate_due_notifications (only counted by the dispatcher). */
    generated?: unknown;
    subs?: Sub[];
    generateError?: boolean;
    pendingError?: boolean;
    purgeError?: boolean;
    purgeThrows?: boolean;
  } = {},
): FakeDb {
  const ok = { error: null as DbError | null };
  const db: FakeDb = {
    subs: new Map((o.subs ?? []).map((s) => [s.id, { ...s }])),
    delivered: new Map(),
    successAt: new Map(),
    calls: [],
    generateArgs: [],
    pendingArgs: [],
    generateDue(nowIso: string): Promise<DbResult> {
      db.calls.push('generateDue');
      db.generateArgs.push(nowIso);
      return Promise.resolve(o.generateError ? { data: null, error: { message: 'boom' } } : { data: o.generated ?? [], error: null });
    },
    pendingPush(nowIso: string, limit: number): Promise<DbResult> {
      db.calls.push('pendingPush');
      db.pendingArgs.push({ nowIso, limit });
      return Promise.resolve(o.pendingError ? { data: null, error: { message: 'boom' } } : { data: o.rows ?? [], error: null });
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
    purge(): Promise<DbResult> {
      db.calls.push('purge');
      if (o.purgeThrows) return Promise.reject(new Error('network'));
      return Promise.resolve(o.purgeError ? { data: null, error: { message: 'boom' } } : { data: 3, error: null });
    },
  };
  return db;
}

type Sent = { target: PushTarget; payload: PushPayload; vapid: VapidConfig };

/** Push sender returning a fixed status per subscription endpoint (default 201). `throw` simulates a local error. */
function fakeSender(byEndpoint: Record<string, number | null | 'throw' | 'blocked'> = {}, onSend?: () => void) {
  const sent: Sent[] = [];
  const send = (target: PushTarget, payload: PushPayload, vapid: VapidConfig): Promise<PushOutcome> => {
    sent.push({ target, payload, vapid });
    onSend?.();
    const s = byEndpoint[target.endpoint];
    if (s === 'throw') return Promise.reject(new Error('bad key'));
    if (s === 'blocked') return Promise.resolve({ status: null, blocked: true });
    return Promise.resolve({ status: s === undefined ? 201 : s });
  };
  return { sent, send };
}

function harness(
  o: {
    env?: Record<string, string>;
    db?: FakeDb;
    sender?: ReturnType<typeof fakeSender>;
    vapidValid?: boolean;
    now?: () => number;
  } = {},
) {
  const env: Record<string, string> = { NOTIFY_CRON_SECRET: SECRET, ...VAPID_ENV, ...o.env };
  const db = o.db ?? fakeDb();
  const sender = o.sender ?? fakeSender();
  const logs: string[] = [];
  const deps: DispatchDeps = {
    env: (k) => env[k],
    now: o.now ?? (() => NOW),
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

const counts = (o: Partial<Record<'generated' | 'pending' | 'pushed' | 'failed' | 'removed' | 'deferred', number>>) => ({
  generated: 0,
  pending: 0,
  pushed: 0,
  failed: 0,
  removed: 0,
  deferred: 0,
  ...o,
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

Deno.test('wrong, missing or non-Bearer secret → 401 and no database work', async () => {
  for (const auth of [null, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`, SECRET, `bearer ${SECRET}`, `Bearer  ${SECRET}`]) {
    const h = harness({ now: () => Date.UTC(2026, 9, 14, PURGE_UTC_HOUR, 5) });
    const res = await handle(post(auth), h.deps);
    assert.equal(res.status, 401, String(auth));
    assert.deepEqual(await body(res), { error: 'unauthorized' });
    assert.deepEqual(h.db.calls, [], 'not even the purge runs for an unauthorised caller');
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
// Generate + pickup + push
// ---------------------------------------------------------------------------

Deno.test('calls generate_due_notifications, then the pickup, both with the current time as ISO', async () => {
  const h = harness();
  const res = await handle(post(), h.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(h.db.generateArgs, [new Date(NOW).toISOString()]);
  assert.deepEqual(h.db.pendingArgs, [{ nowIso: new Date(NOW).toISOString(), limit: PENDING_LIMIT }]);
  assert.deepEqual(await body(res), counts({}));
  assert.deepEqual(h.db.calls, ['generateDue', 'pendingPush']);
});

Deno.test('generate_due_notifications error → 500 generate_failed, nothing picked up or pushed', async () => {
  const h = harness({ db: fakeDb({ generateError: true }) });
  const res = await handle(post(), h.deps);
  assert.equal(res.status, 500);
  assert.deepEqual(await body(res), { error: 'generate_failed' });
  assert.equal(h.sender.sent.length, 0);
  assert.deepEqual(h.db.calls, ['generateDue']);
});

Deno.test('pickup error → 500 pickup_failed (the rows stay pending for the next run)', async () => {
  const h = harness({ db: fakeDb({ pendingError: true, generated: [{}, {}] }) });
  const res = await handle(post(), h.deps);
  assert.equal(res.status, 500);
  assert.deepEqual(await body(res), { error: 'pickup_failed', ...counts({ generated: 2 }) });
  assert.equal(h.sender.sent.length, 0);
});

Deno.test('rows created by an earlier run that never got pushed are picked up and delivered (retry)', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], generated: [], subs: [sub('s1', USER_A)] });
  const h = harness({ db });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), counts({ generated: 0, pending: 1, pushed: 1 }));
  assert.equal(h.sender.sent.length, 1);
  assert.ok(db.delivered.has(NOTE_A), 'marked delivered only after the send');
});

Deno.test('a failed send leaves the row undelivered so the next run retries it', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A)] });
  const sender = fakeSender({ [endpointOf('s1')]: 503 });
  const first = harness({ db, sender });
  await handle(post(), first.deps);
  assert.equal(db.delivered.size, 0);
  // Next run: the push service is back.
  sender.sent.length = 0;
  const next = harness({ db, sender: fakeSender() });
  const res = await handle(post(), next.deps);
  assert.deepEqual(await body(res), counts({ pending: 1, pushed: 1 }));
  assert.ok(db.delivered.has(NOTE_A));
});

Deno.test('missing VAPID env → push skipped, still 200 with counts', async () => {
  for (const missing of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
    const db = fakeDb({ rows: [due(NOTE_A, USER_A)], generated: [{}], subs: [sub('s1', USER_A)] });
    const h = harness({ db, env: { [missing]: '' } });
    const res = await handle(post(), h.deps);
    assert.equal(res.status, 200, missing);
    assert.deepEqual(await body(res), counts({ generated: 1, pending: 1 }));
    assert.equal(h.sender.sent.length, 0);
    assert.deepEqual(db.calls, ['generateDue', 'pendingPush']);
  }
});

Deno.test('invalid or mismatched VAPID keys → push skipped, subscriptions untouched, still 200', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A, 4)] });
  const h = harness({ db, vapidValid: false });
  const res = await handle(post(), h.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await body(res), counts({ pending: 1 }));
  assert.equal(h.sender.sent.length, 0);
  assert.deepEqual(db.calls, ['generateDue', 'pendingPush']);
  assert.match(h.logs.join('\n'), /VAPID keys invalid/);
});

Deno.test('success → payload is exactly the generic title/body/url from the pickup, bookkeeping updated', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A), due(NOTE_B, USER_B)], subs: [sub('s1', USER_A, 2), sub('s2', USER_B)] });
  const h = harness({ db });
  const res = await handle(post(), h.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await body(res), counts({ pending: 2, pushed: 2 }));

  const toA = h.sender.sent.find((s) => s.target.endpoint.endsWith('/s1'))!;
  assert.deepEqual(toA.payload, {
    notification_id: NOTE_A,
    title: 'Ôn tập nhanh 5 phút',
    body: 'Có vài thẻ đang chờ bạn ôn nhanh.',
    url: '/app/on-tap',
  });
  assert.deepEqual(toA.target, { endpoint: endpointOf('s1'), p256dh: 'p256dh-s1', auth: 'auth-s1' });
  assert.deepEqual(toA.vapid, { publicKey: 'public-key', privateKey: 'private-key', subject: 'mailto:ops@example.com' });

  const at = new Date(NOW).toISOString();
  assert.equal(db.delivered.get(NOTE_A), at);
  assert.equal(db.delivered.get(NOTE_B), at);
  assert.equal(db.successAt.get('s1'), at);
  assert.equal(db.subs.get('s1')!.failure_count, 0, 'success resets the failure streak');
});

Deno.test('a user with several devices gets one push per device; one success marks the notification delivered', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A), sub('s2', USER_A)] });
  const sender = fakeSender({ [endpointOf('s1')]: 500 });
  const h = harness({ db, sender });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), counts({ pending: 1, pushed: 1, failed: 1 }));
  assert.equal(sender.sent.length, 2);
  assert.ok(db.delivered.has(NOTE_A));
});

// ---------------------------------------------------------------------------
// Subscription wear-down
// ---------------------------------------------------------------------------

Deno.test('410 and 404 → subscription deleted', async () => {
  for (const status of [410, 404]) {
    const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A)] });
    const h = harness({ db, sender: fakeSender({ [endpointOf('s1')]: status }) });
    const res = await handle(post(), h.deps);
    assert.deepEqual(await body(res), counts({ pending: 1, failed: 1, removed: 1 }), String(status));
    assert.equal(db.subs.has('s1'), false);
    assert.ok(db.calls.includes('delete:s1'));
    assert.equal(db.delivered.size, 0, 'not delivered');
  }
});

Deno.test('network error, 429, 5xx, 3xx and other 4xx never count against the subscription, however often they happen', async () => {
  for (const status of [null, 429, 500, 502, 503, 301, 302, 307, 308, 400, 413]) {
    const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A, MAX_PUSH_FAILURES - 1)] });
    const h = harness({ db, sender: fakeSender({ [endpointOf('s1')]: status }) });
    const res = await handle(post(), h.deps);
    assert.deepEqual(await body(res), counts({ pending: 1, failed: 1 }), String(status));
    assert.equal(db.subs.has('s1'), true, `${status}: kept`);
    assert.equal(db.subs.get('s1')!.failure_count, MAX_PUSH_FAILURES - 1, `${status}: failure_count untouched`);
    assert.equal(db.calls.some((c) => c.startsWith('update:') || c.startsWith('delete:')), false, String(status));
    assert.equal(db.successAt.size, 0);
    assert.equal(db.delivered.size, 0);
  }
});

Deno.test('401 and 403 count as one failure per run; the subscription is kept below the higher threshold', async () => {
  for (const status of [401, 403]) {
    const db = fakeDb({
      rows: [due(NOTE_A, USER_A), due(NOTE_B, USER_A), due(NOTE_C, USER_A)],
      subs: [sub('s1', USER_A, 1)],
    });
    const sender = fakeSender({ [endpointOf('s1')]: status });
    const h = harness({ db, sender });
    const res = await handle(post(), h.deps);
    assert.equal(db.subs.get('s1')!.failure_count, 2, `${status}: +1 per run, not per message`);
    assert.equal(sender.sent.length, 1, 'no point sending the other messages to a refusing service');
    assert.deepEqual(await body(res), counts({ pending: 3, failed: 1 }));
    assert.equal(db.delivered.size, 0);
  }
});

Deno.test(`401/403 reaching ${MAX_PUSH_FAILURES} failed runs → subscription deleted`, async () => {
  assert.ok(MAX_PUSH_FAILURES > 5, 'higher than the old threshold of 5');
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A, MAX_PUSH_FAILURES - 1)] });
  const h = harness({ db, sender: fakeSender({ [endpointOf('s1')]: 403 }) });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), counts({ pending: 1, failed: 1, removed: 1 }));
  assert.equal(db.subs.has('s1'), false);
});

Deno.test('a success resets failure_count even after earlier 401/403 runs', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A, 7)] });
  const h = harness({ db });
  await handle(post(), h.deps);
  assert.equal(db.subs.get('s1')!.failure_count, 0);
});

Deno.test('local sender error (malformed stored key) → counted as failed, subscription untouched', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A, 3)] });
  const h = harness({ db, sender: fakeSender({ [endpointOf('s1')]: 'throw' }) });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), counts({ pending: 1, failed: 1 }));
  assert.equal(db.subs.get('s1')!.failure_count, 3);
  assert.deepEqual(db.calls, ['generateDue', 'pendingPush', 'subscriptionsFor']);
});

// ---------------------------------------------------------------------------
// SSRF defence in depth
// ---------------------------------------------------------------------------

Deno.test('a stored endpoint outside the push-service allowlist is deleted without any request', async () => {
  const bad = { ...sub('s1', USER_A), endpoint: 'https://169.254.169.254/latest/meta-data/' };
  const localhost = { ...sub('s2', USER_A), endpoint: 'https://localhost/x' };
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [bad, localhost, sub('s3', USER_A)] });
  const h = harness({ db });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), counts({ pending: 1, pushed: 1, removed: 2 }));
  assert.deepEqual(h.sender.sent.map((s) => s.target.endpoint), [endpointOf('s3')]);
  assert.equal(db.subs.has('s1'), false);
  assert.equal(db.subs.has('s2'), false);
});

Deno.test('the sender refusing a host (blocked) deletes the subscription', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A)] });
  const h = harness({ db, sender: fakeSender({ [endpointOf('s1')]: 'blocked' }) });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), counts({ pending: 1, removed: 1 }));
  assert.equal(db.subs.has('s1'), false);
});

// ---------------------------------------------------------------------------
// Deadline
// ---------------------------------------------------------------------------

Deno.test('no new push starts after the global deadline; the rest stays pending for the next run', async () => {
  let clock = NOW;
  // Every send takes 60 s: the second one starts at 60 s, the third would start at 120 s > 100 s.
  const sender = fakeSender({}, () => {
    clock += 60_000;
  });
  const db = fakeDb({
    rows: [due(NOTE_A, USER_A), due(NOTE_B, USER_A), due(NOTE_C, USER_A)],
    subs: [sub('s1', USER_A)],
  });
  const h = harness({ db, sender, now: () => clock });
  const res = await handle(post(), h.deps);
  assert.equal(res.status, 200);
  assert.equal(sender.sent.length, 2);
  assert.deepEqual(await body(res), counts({ pending: 3, pushed: 2, deferred: 1 }));
  assert.deepEqual([...db.delivered.keys()].sort(), [NOTE_A, NOTE_B]);
  assert.ok(DISPATCH_DEADLINE_MS <= 100_000);
});

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

Deno.test('malformed pickup rows are skipped, valid ones still pushed', async () => {
  const rows = [due(NOTE_A, USER_A), { notification_id: 'nope', user_id: USER_B }, null];
  const db = fakeDb({ rows, subs: [sub('s1', USER_A), sub('s2', USER_B)] });
  const h = harness({ db });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), counts({ pending: 1, pushed: 1 }));
  assert.equal(h.sender.sent.length, 1);
});

Deno.test('users without subscriptions: counted as pending, nothing pushed', async () => {
  const db = fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [] });
  const h = harness({ db });
  const res = await handle(post(), h.deps);
  assert.deepEqual(await body(res), counts({ pending: 1 }));
  assert.equal(db.calls.includes('markDelivered'), false);
});

Deno.test('logs never contain endpoints, keys, secrets or notification text', async () => {
  const db = fakeDb({
    rows: [due(NOTE_A, USER_A), due(NOTE_B, USER_B)],
    subs: [sub('s1', USER_A), sub('s2', USER_B)],
  });
  const h = harness({ db, sender: fakeSender({ [endpointOf('s2')]: 410 }), now: () => Date.UTC(2026, 9, 14, PURGE_UTC_HOUR, 5) });
  await handle(post(), h.deps);
  const all = h.logs.join('\n');
  for (const secret of ['fcm.googleapis.com', 'p256dh-', 'auth-s', 'private-key', 'public-key', SECRET, 'Ôn tập', 'thẻ', USER_A]) {
    assert.equal(all.includes(secret), false, secret);
  }
  assert.match(all, /generated=0 pending=2 pushed=1 failed=1 removed=1 deferred=0/);
});

// ---------------------------------------------------------------------------
// Daily purge (90-day inbox retention)
// ---------------------------------------------------------------------------

Deno.test('purge_notifications runs in the purge hour, even when there is nothing to push', async () => {
  const h = harness({ now: () => Date.UTC(2026, 9, 14, PURGE_UTC_HOUR, 10) });
  const res = await handle(post(), h.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(h.db.calls, ['generateDue', 'pendingPush', 'purge']);
  assert.match(h.logs.join('\n'), /purged=3/);
});

Deno.test('purge_notifications runs after a push run too, and after a failed generate', async () => {
  const when = () => Date.UTC(2026, 9, 14, PURGE_UTC_HOUR, 40);
  const withRows = harness({ db: fakeDb({ rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A)] }), now: when });
  await handle(post(), withRows.deps);
  assert.equal(withRows.db.calls.at(-1), 'purge');
  const failed = harness({ db: fakeDb({ generateError: true }), now: when });
  const res = await handle(post(), failed.deps);
  assert.equal(res.status, 500);
  assert.equal(failed.db.calls.at(-1), 'purge');
});

Deno.test('purge_notifications is not called in any other hour', async () => {
  for (let hour = 0; hour < 24; hour++) {
    if (hour === PURGE_UTC_HOUR) continue;
    const h = harness({ now: () => Date.UTC(2026, 9, 14, hour, 5) });
    await handle(post(), h.deps);
    assert.equal(h.db.calls.includes('purge'), false, `hour ${hour}`);
  }
});

Deno.test('a failing purge (error or exception) never fails the dispatch', async () => {
  for (const o of [{ purgeError: true }, { purgeThrows: true }]) {
    const h = harness({
      db: fakeDb({ ...o, rows: [due(NOTE_A, USER_A)], subs: [sub('s1', USER_A)] }),
      now: () => Date.UTC(2026, 9, 14, PURGE_UTC_HOUR, 5),
    });
    const res = await handle(post(), h.deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await body(res), counts({ pending: 1, pushed: 1 }));
    assert.match(h.logs.join('\n'), /purge_notifications failed/);
  }
});
