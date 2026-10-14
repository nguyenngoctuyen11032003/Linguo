// Network wiring only; the pipeline lives in handler.ts (spec 10 §3).
import { createClient } from '@supabase/supabase-js';
import { type DbResult, type DispatchDb, type DispatchDeps, handle } from './handler.ts';
import { createWebPushSender, isValidVapid } from './push.ts';

const env = (k: string) => Deno.env.get(k);

let db: DispatchDb | null = null;

function serviceDb(): DispatchDb {
  // service_role (auto-injected secret): generate_due_notifications is granted to service_role only, and
  // push_subscriptions / notifications are written outside any user's RLS.
  const client = createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // Untyped database (no generated types in Deno): widen rpc to a string-keyed shape.
  const rpc = client.rpc.bind(client) as unknown as (fn: string, args?: Record<string, unknown>) => PromiseLike<DbResult>;
  return {
    generateDue: (nowIso) => rpc('generate_due_notifications', { p_now: nowIso }),
    subscriptionsFor: (userIds) =>
      client.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, failure_count').in('user_id', userIds),
    deleteSubscription: (id) => client.from('push_subscriptions').delete().eq('id', id),
    updateSubscription: (id, patch) => client.from('push_subscriptions').update(patch as never).eq('id', id),
    markDelivered: (ids, atIso) =>
      client.from('notifications').update({ delivered_push_at: atIso } as never).in('id', ids).is('delivered_push_at', null),
  };
}

const deps: DispatchDeps = {
  env,
  now: Date.now,
  get db() {
    return (db ??= serviceDb());
  },
  sendPush: createWebPushSender((input, init) => fetch(input, init)),
  vapidValid: isValidVapid,
  log: (message) => console.log(message),
};

Deno.serve(async (req) => {
  try {
    return await handle(req, deps);
  } catch {
    console.log('notify-dispatch: unexpected error');
    return new Response(JSON.stringify({ error: 'internal' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
});
