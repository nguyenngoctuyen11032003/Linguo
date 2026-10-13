// Network wiring only; the pipeline lives in handler.ts (spec 5 §2).
import { createClient } from '@supabase/supabase-js';
import { CORS_HEADERS, type DbResult, handle, type HandlerDeps, type SupabaseLike } from './handler.ts';
import { createBreaker } from './lib/breaker.ts';
import { createIpLimiter } from './lib/ip-limiter.ts';

const env = (k: string) => Deno.env.get(k);

// One breaker per isolate (in memory, spec §3 step 7).
const breaker = createBreaker({ failureThreshold: 5, windowMs: 60_000, openMs: 60_000, now: Date.now });

// Spec 7 §3: at most 30 requests per minute per client IP, per isolate.
const ipLimiter = createIpLimiter({ limit: 30, windowMs: 60_000, now: Date.now });

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

function adapt(client: ReturnType<typeof createClient>): SupabaseLike {
  // Untyped database (no generated types in Deno): widen rpc to the handler's string-keyed shape.
  const rpc = client.rpc.bind(client) as unknown as (fn: string, args?: Record<string, unknown>) => PromiseLike<DbResult>;
  return {
    auth: { getUser: (jwt) => client.auth.getUser(jwt) },
    rpc: (fn, args) => rpc(fn, args),
    from: (table) => ({
      select: (columns) => ({
        eq: (column, value) => ({
          maybeSingle: () => client.from(table).select(columns).eq(column, value).maybeSingle() as PromiseLike<DbResult>,
        }),
      }),
    }),
  };
}

let service: SupabaseLike | null = null;

const deps: HandlerDeps = {
  env,
  fetch: (input, init) => fetch(input, init),
  now: Date.now,
  random: Math.random,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  breaker,
  ipLimiter,
  // Anon key + the caller's Authorization: every query and RPC runs as the user, under RLS.
  supabase: (authHeader) =>
    adapt(
      createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
        auth: NO_SESSION,
      }),
    ),
  // service_role (auto-injected secret): only the cache / usage-log / refund RPCs, never user data reads.
  serviceSupabase:
    () => (service ??= adapt(createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: NO_SESSION }))),
};

Deno.serve(async (req) => {
  try {
    return await handle(req, deps);
  } catch {
    return new Response(
      JSON.stringify({
        error: 'ai_unavailable',
        message: 'Gia sư AI tạm thời không khả dụng.',
        retry_after_sec: null,
        quota: null,
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
});
