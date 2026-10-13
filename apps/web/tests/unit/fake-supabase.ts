import type { AppSupabaseClient } from '@/lib/supabase';

export interface FakeQuery {
  calls: Array<[string, unknown[]]>;
  builder: Record<string, unknown>;
}

/**
 * Chainable, awaitable stand-in for a PostgREST query builder. `data` may be a row, an array of rows
 * (an UPDATE ... SELECT result) or `[]` (an UPDATE that matched nothing, e.g. blocked by RLS).
 */
export function fakeQuery({ data, error = null }: { data: unknown; error?: unknown }): FakeQuery {
  const result = { data, error };
  const calls: FakeQuery['calls'] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'neq', 'in', 'order', 'update', 'single', 'maybeSingle']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { calls, builder };
}

export interface FakeRpc {
  data: unknown;
  error?: unknown;
}

export type FakeClient = AppSupabaseClient & { rpcCalls: Array<[string, Record<string, unknown>]> };

export function fakeClient(tables: Record<string, FakeQuery>, rpcs: Record<string, FakeRpc> = {}): FakeClient {
  const rpcCalls: FakeClient['rpcCalls'] = [];
  return {
    rpcCalls,
    from: (table: string) => {
      const q = tables[table];
      if (!q) throw new Error(`No fake for table ${table}`);
      return q.builder;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push([name, args]);
      const r = rpcs[name];
      if (!r) throw new Error(`No fake for rpc ${name}`);
      return Promise.resolve({ data: r.data, error: r.error ?? null });
    },
  } as unknown as FakeClient;
}
