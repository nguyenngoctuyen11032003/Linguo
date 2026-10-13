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
  for (const method of ['select', 'eq', 'update', 'single', 'maybeSingle']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { calls, builder };
}

export function fakeClient(tables: Record<string, FakeQuery>): AppSupabaseClient {
  return {
    from: (table: string) => {
      const q = tables[table];
      if (!q) throw new Error(`No fake for table ${table}`);
      return q.builder;
    },
  } as unknown as AppSupabaseClient;
}
