import { todaySessionResultSchema, updateSessionItemArgsSchema, type ActivityStatus, type TodaySessionResult } from '@linguo/shared';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Minimal spec 6 RPC calls used outside the session page (home card, lesson and review return). The session
// feature (features/session) may own the full service later; both parse with the same shared contracts.

export async function getTodaySession(client: AppSupabaseClient, pathId: string): Promise<TodaySessionResult> {
  return parse(todaySessionResultSchema, await callRpc(client, 'get_today_session', { p_path_id: pathId }));
}

export interface SessionItemReport {
  sessionId: string;
  itemId: string;
  status: ActivityStatus;
  seconds: number;
}

export async function reportSessionItem(client: AppSupabaseClient, report: SessionItemReport): Promise<void> {
  const args = updateSessionItemArgsSchema.parse({
    p_session_id: report.sessionId,
    p_item_id: report.itemId,
    p_status: report.status,
    p_seconds: Math.max(0, Math.round(report.seconds)),
  });
  await callRpc(client, 'update_session_item', args);
}

/** The RPC is not deployed yet (PostgREST PGRST202 / HTTP 404): callers hide the feature instead of erroring. */
export function isMissingRpc(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; status?: unknown };
  return e.code === 'PGRST202' || e.status === 404;
}
