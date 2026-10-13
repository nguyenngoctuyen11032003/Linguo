import {
  motivationPrefsSchema,
  progressDashboardSchema,
  type MotivationPrefs,
  type ProgressDashboard,
  type ProgressRange,
} from '@linguo/shared';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Spec 8 §4. get_progress_dashboard is validated with the shared zod contract; the motivation preferences live in
// user_preferences (column-level UPDATE grant, like theme).

const PREFS_COLUMNS = 'show_motivation, analytics_opt_out';

type QueryResult = { data: unknown; error: unknown };
interface UntypedQuery extends PromiseLike<QueryResult> {
  select(columns: string): UntypedQuery;
  update(values: Record<string, unknown>): UntypedQuery;
  eq(column: string, value: unknown): UntypedQuery;
  single(): UntypedQuery;
}
/** The generated Database types do not list the spec 8 columns yet; the zod contract is the source of truth. */
interface UntypedTableClient {
  from(table: 'user_preferences'): UntypedQuery;
}

const prefsTable = (client: AppSupabaseClient) => (client as unknown as UntypedTableClient).from('user_preferences');

export async function getProgressDashboard(client: AppSupabaseClient, pathId: string, range: ProgressRange): Promise<ProgressDashboard> {
  const data = await callRpc(client, 'get_progress_dashboard', { p_path_id: pathId, p_range_days: range });
  return parse(progressDashboardSchema, data);
}

export async function getMotivationPrefs(client: AppSupabaseClient, userId: string): Promise<MotivationPrefs> {
  const { data, error } = await prefsTable(client).select(PREFS_COLUMNS).eq('user_id', userId).single();
  if (error) throw error;
  return parse(motivationPrefsSchema, data);
}

export async function updateMotivationPrefs(
  client: AppSupabaseClient,
  userId: string,
  patch: Partial<MotivationPrefs>,
): Promise<MotivationPrefs> {
  const values: Record<string, boolean> = {};
  if (patch.show_motivation !== undefined) values.show_motivation = patch.show_motivation;
  if (patch.analytics_opt_out !== undefined) values.analytics_opt_out = patch.analytics_opt_out;
  if (Object.keys(values).length === 0) return getMotivationPrefs(client, userId);
  const { data, error } = await prefsTable(client).update(values).eq('user_id', userId).select(PREFS_COLUMNS);
  if (error) throw error;
  // An UPDATE blocked by RLS (or a missing row) answers with no rows instead of an error.
  if (!Array.isArray(data) || data.length === 0) throw new Error('NO_ROWS_UPDATED');
  return parse(motivationPrefsSchema, data[0]);
}
