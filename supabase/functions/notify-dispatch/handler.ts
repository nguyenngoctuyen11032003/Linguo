// Spec 10 §3: the notify-dispatch pipeline. Called every 15 minutes by .github/workflows/notify.yml with
// `Authorization: Bearer <NOTIFY_CRON_SECRET>` (verify_jwt = false). Every side effect (database, clock,
// Web Push) arrives through `deps`, so handler_test.ts drives the whole flow with fakes.
//
// Delivery is at-least-once per notification, not at-most-once: generate_due_notifications creates the inbox
// rows, then pending_push_notifications returns every row still without delivered_push_at (created within the
// push TTL), so a run that failed after generating is retried by the next run. A subscription is only deleted
// for a 404/410, or after repeated 401/403; network errors, 429 and 5xx never wear it down.
//
// Logs carry counts only: never endpoints, subscription keys, VAPID keys or notification text.
import { z } from 'zod';
import { isAllowedPushEndpoint } from './endpoint.ts';

export type DbError = { message: string };
export type DbResult = { data: unknown; error: DbError | null };

/** Service-role database operations (all bypass RLS; nothing here runs as a user). */
export interface DispatchDb {
  /** rpc('generate_due_notifications', { p_now }) → jsonb array of the rows created by this call. */
  generateDue(nowIso: string): PromiseLike<DbResult>;
  /**
   * rpc('pending_push_notifications', { p_now, p_limit }) → jsonb array of dueNotificationSchema rows: inbox rows
   * with delivered_push_at null, push enabled, a device, created within the push TTL, with the generic push text.
   */
  pendingPush(nowIso: string, limit: number): PromiseLike<DbResult>;
  /** push_subscriptions rows (id, user_id, endpoint, p256dh, auth, failure_count) of these users. */
  subscriptionsFor(userIds: string[]): PromiseLike<DbResult>;
  deleteSubscription(id: string): PromiseLike<{ error: DbError | null }>;
  updateSubscription(id: string, patch: { failure_count: number; last_success_at?: string }): PromiseLike<{ error: DbError | null }>;
  /** notifications.delivered_push_at = atIso for these ids. */
  markDelivered(notificationIds: string[], atIso: string): PromiseLike<{ error: DbError | null }>;
  /** rpc('purge_notifications') → number of inbox rows older than 90 days that were deleted. */
  purge(): PromiseLike<DbResult>;
}

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };
/**
 * HTTP status from the push service, or null when the request never got an answer (network, timeout) or was
 * refused locally (`blocked`: the endpoint host is outside the allowlist).
 */
export type PushOutcome = { status: number | null; blocked?: boolean };
/** Sends one encrypted message. Throws only for local problems (bad VAPID key, malformed subscription). */
export type PushSender = (target: PushTarget, payload: PushPayload, vapid: VapidConfig) => Promise<PushOutcome>;

export interface DispatchDeps {
  env: (k: string) => string | undefined;
  now: () => number;
  db: DispatchDb;
  sendPush: PushSender;
  /** Checks the VAPID pair once per run (push.ts isValidVapid); false → push skipped, subscriptions untouched. */
  vapidValid: (vapid: VapidConfig) => Promise<boolean>;
  log?: (message: string) => void;
}

/** Mirrors dueNotificationSchema (packages/shared/src/notifications/contract.ts). */
const dueNotificationSchema = z.object({
  notification_id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  url: z.string(),
});
type DueNotification = z.infer<typeof dueNotificationSchema>;

/**
 * Mirrors pushPayloadSchema: title, body and URL only. The text is generic (it shows on the lock screen): the
 * database builds it by notification kind and never puts lesson titles, card counts or study minutes in it.
 */
export type PushPayload = { notification_id: string; title: string; body: string; url: string };

const subscriptionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
  failure_count: z.number().int().min(0).nullable().optional(),
});
type Subscription = z.infer<typeof subscriptionSchema>;

/**
 * Mirrors REMINDER_RULES.max_push_failures: failure_count only counts runs in which the push service answered
 * 401/403 (our VAPID identity was refused); the subscription is deleted once it reaches this.
 */
export const MAX_PUSH_FAILURES = 10;
/** NOTIFY_CRON_SECRET shorter than this is treated as unset (docs: `openssl rand -hex 32`). */
export const MIN_SECRET_LENGTH = 32;
/** No new push is started once a run has taken this long; the rest is picked up by the next run. */
export const DISPATCH_DEADLINE_MS = 100_000;
/** Most notifications picked up per run (the cron comes back every 15 minutes). */
export const PENDING_LIMIT = 500;
/** The purge (90-day inbox retention) is tried by every run in this UTC hour (03:xx Asia/Ho_Chi_Minh). */
export const PURGE_UTC_HOUR = 20;
/** Subscriptions pushed in parallel; each subscription's messages go out one after another. */
const CONCURRENCY = 8;
/** user_id values per `in (...)` query, keeping the PostgREST URL short. */
const USER_CHUNK = 100;

export type DispatchResult = {
  /** Inbox rows created by this run. */
  generated: number;
  /** Rows waiting for a push (created now or by an earlier run that did not deliver them). */
  pending: number;
  pushed: number;
  failed: number;
  removed: number;
  /** Sends not started because the run hit DISPATCH_DEADLINE_MS. */
  deferred: number;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Constant-time comparison: both sides are hashed first, so neither length nor content leaks through timing. */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i]! ^ hb[i]!;
  return diff === 0;
}

async function authorized(req: Request, deps: DispatchDeps): Promise<boolean> {
  const secret = deps.env('NOTIFY_CRON_SECRET')?.trim() ?? '';
  if (secret.length < MIN_SECRET_LENGTH) {
    deps.log?.('notify-dispatch: NOTIFY_CRON_SECRET is unset or too short; refusing every request');
    return false;
  }
  const header = req.headers.get('authorization') ?? '';
  return await timingSafeEqual(header, `Bearer ${secret}`);
}

function vapidConfig(deps: DispatchDeps): VapidConfig | null {
  const publicKey = deps.env('VAPID_PUBLIC_KEY')?.trim();
  const privateKey = deps.env('VAPID_PRIVATE_KEY')?.trim();
  const subject = deps.env('VAPID_SUBJECT')?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

async function loadSubscriptions(db: DispatchDb, userIds: string[]): Promise<Subscription[] | null> {
  const out: Subscription[] = [];
  for (let i = 0; i < userIds.length; i += USER_CHUNK) {
    const { data, error } = await db.subscriptionsFor(userIds.slice(i, i + USER_CHUNK));
    if (error) return null;
    for (const raw of Array.isArray(data) ? data : []) {
      const parsed = subscriptionSchema.safeParse(raw);
      if (parsed.success) out.push(parsed.data);
    }
  }
  return out;
}

async function runPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!);
  });
  await Promise.all(workers);
}

export async function handle(req: Request, deps: DispatchDeps): Promise<Response> {
  if (req.method !== 'POST' || !(await authorized(req, deps))) return json(401, { error: 'unauthorized' });
  const response = await dispatch(deps);
  await purgeIfDue(deps);
  return response;
}

/**
 * Inbox retention (90 days): runs in the first hours of the Vietnamese night, whichever run gets there. Every run
 * of that hour tries (so a skipped or late cron does not skip the day); the delete is idempotent and indexed.
 * Never fails the dispatch.
 */
async function purgeIfDue(deps: DispatchDeps): Promise<void> {
  if (new Date(deps.now()).getUTCHours() !== PURGE_UTC_HOUR) return;
  try {
    const { data, error } = await deps.db.purge();
    if (error) deps.log?.('notify-dispatch: purge_notifications failed');
    else deps.log?.(`notify-dispatch: purged=${typeof data === 'number' ? data : 0}`);
  } catch {
    deps.log?.('notify-dispatch: purge_notifications failed');
  }
}

async function dispatch(deps: DispatchDeps): Promise<Response> {
  const startedAt = deps.now();
  const nowIso = new Date(startedAt).toISOString();
  const result: DispatchResult = { generated: 0, pending: 0, pushed: 0, failed: 0, removed: 0, deferred: 0 };

  const generated = await deps.db.generateDue(nowIso);
  if (generated.error) {
    deps.log?.('notify-dispatch: generate_due_notifications failed');
    return json(500, { error: 'generate_failed' });
  }
  result.generated = Array.isArray(generated.data) ? generated.data.length : 0;

  // Whatever generate_due_notifications returned is only a count: the rows to push come from the retryable
  // pickup, which also returns rows created by earlier runs that were never delivered.
  const pickup = await deps.db.pendingPush(nowIso, PENDING_LIMIT);
  if (pickup.error) {
    deps.log?.('notify-dispatch: pending_push_notifications failed');
    return json(500, { error: 'pickup_failed', ...result });
  }
  const rows: DueNotification[] = [];
  let invalid = 0;
  for (const raw of Array.isArray(pickup.data) ? pickup.data : []) {
    const parsed = dueNotificationSchema.safeParse(raw);
    if (parsed.success) rows.push(parsed.data);
    else invalid++;
  }
  if (invalid) deps.log?.(`notify-dispatch: skipped ${invalid} malformed due rows`);
  result.pending = rows.length;
  if (rows.length === 0) {
    deps.log?.(`notify-dispatch: generated=${result.generated} pending=0`);
    return json(200, result);
  }

  const vapid = vapidConfig(deps);
  if (!vapid) {
    // The in-app inbox rows already exist; push is optional (spec 10 §3).
    deps.log?.(`notify-dispatch: VAPID keys not set, push skipped (pending=${result.pending})`);
    return json(200, result);
  }
  if (!(await deps.vapidValid(vapid))) {
    // A broken key would make every push service answer 401/403 and wrongly wear down every subscription.
    deps.log?.(`notify-dispatch: VAPID keys invalid or mismatched, push skipped (pending=${result.pending})`);
    return json(200, result);
  }

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const subscriptions = await loadSubscriptions(deps.db, userIds);
  if (!subscriptions) {
    deps.log?.('notify-dispatch: loading push_subscriptions failed');
    return json(500, { error: 'subscriptions_failed', ...result });
  }

  const rowsByUser = new Map<string, DueNotification[]>();
  for (const r of rows) rowsByUser.set(r.user_id, [...(rowsByUser.get(r.user_id) ?? []), r]);

  const delivered = new Set<string>();
  let dbErrors = 0;
  const check = ({ error }: { error: DbError | null }) => {
    if (error) dbErrors++;
  };
  const expired = () => deps.now() - startedAt >= DISPATCH_DEADLINE_MS;

  await runPool(subscriptions, CONCURRENCY, async (sub) => {
    const userRows = rowsByUser.get(sub.user_id) ?? [];
    // Defence in depth: the database CHECK keeps foreign hosts out; a row that got in anyway is removed unsent.
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      check(await deps.db.deleteSubscription(sub.id));
      result.removed++;
      return;
    }
    const target: PushTarget = { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth };
    let authRefused = false;
    let succeeded = false;
    for (const [index, row] of userRows.entries()) {
      if (expired()) {
        result.deferred += userRows.length - index;
        break;
      }
      const payload: PushPayload = { notification_id: row.notification_id, title: row.title, body: row.body, url: row.url };
      let outcome: PushOutcome;
      try {
        outcome = await deps.sendPush(target, payload, vapid);
      } catch {
        // Local problem (bad VAPID key, malformed stored keys): not the endpoint's fault, keep the row.
        result.failed++;
        continue;
      }
      const status = outcome.status;
      if (outcome.blocked) {
        // Refused before any request: the endpoint is not a push service.
        check(await deps.db.deleteSubscription(sub.id));
        result.removed++;
        return;
      }
      if (status !== null && status >= 200 && status < 300) {
        result.pushed++;
        succeeded = true;
        delivered.add(row.notification_id);
        continue;
      }
      result.failed++;
      if (status === 404 || status === 410) {
        // The browser unsubscribed or the subscription expired: it will never work again.
        check(await deps.db.deleteSubscription(sub.id));
        result.removed++;
        return;
      }
      // Network error (null), 429, 5xx, a 3xx (never followed) or another 4xx: the push service or the network is
      // at fault, not the subscription. The notification stays pending and the next run tries again; nothing
      // counts against the subscription, and the remaining messages wait for that run too.
      if (status === 401 || status === 403) authRefused = true;
      break;
    }

    if (succeeded) {
      check(await deps.db.updateSubscription(sub.id, { failure_count: 0, last_success_at: new Date(deps.now()).toISOString() }));
    } else if (authRefused) {
      // Counted once per run: a subscription made for another VAPID key never works, but one bad run must not delete it.
      const failures = (sub.failure_count ?? 0) + 1;
      if (failures >= MAX_PUSH_FAILURES) {
        check(await deps.db.deleteSubscription(sub.id));
        result.removed++;
      } else {
        check(await deps.db.updateSubscription(sub.id, { failure_count: failures }));
      }
    }
  });

  if (delivered.size) check(await deps.db.markDelivered([...delivered], new Date(deps.now()).toISOString()));
  if (dbErrors) deps.log?.(`notify-dispatch: ${dbErrors} subscription/notification updates failed`);
  deps.log?.(
    `notify-dispatch: generated=${result.generated} pending=${result.pending} pushed=${result.pushed} failed=${result.failed} removed=${result.removed} deferred=${result.deferred}`,
  );
  return json(200, result);
}
