import {
  SESSION_QUERY,
  sessionInputsSchema,
  studySessionSchema,
  todaySessionResultSchema,
  type ActivityStatus,
  type SessionActivity,
  type SessionInputs,
  type SessionPlan,
  type StudySession,
  type TodaySessionResult,
} from '@linguo/shared';
import { z } from 'zod';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Spec 6 §3/§4. Same transport as the lesson and review RPCs: jsonb validated with the shared zod contracts,
// abandoned after 15 s (reported like a network failure).

/** One of today's mistakes from `session_recap(p_session_id)` (at most 10). */
export const sessionMistakeSchema = z.object({
  prompt: z.string(),
  expected: z.string(),
  /** '' (or null from SQL) when the learner revealed the answer without trying. */
  answer: z
    .string()
    .nullable()
    .transform((v) => v ?? ''),
  lesson_id: z.uuid().nullable(),
});
export type SessionMistake = z.infer<typeof sessionMistakeSchema>;
const sessionRecapSchema = z.array(sessionMistakeSchema).max(10);

export async function getSessionInputs(client: AppSupabaseClient, pathId: string): Promise<SessionInputs> {
  return parse(sessionInputsSchema, await callRpc(client, 'get_session_inputs', { p_path_id: pathId }));
}

/** `replace` abandons today's open session; without it the server returns the open session unchanged. */
export async function saveSessionPlan(client: AppSupabaseClient, pathId: string, plan: SessionPlan, replace: boolean): Promise<StudySession> {
  const data = await callRpc(client, 'save_session_plan', { p_path_id: pathId, p_plan: plan, p_replace: replace });
  return parse(studySessionSchema, data);
}

export async function getTodaySession(client: AppSupabaseClient, pathId: string): Promise<TodaySessionResult> {
  return parse(todaySessionResultSchema, await callRpc(client, 'get_today_session', { p_path_id: pathId }));
}

export async function updateSessionItem(
  client: AppSupabaseClient,
  sessionId: string,
  itemId: string,
  status: ActivityStatus,
  seconds = 0,
): Promise<StudySession> {
  const data = await callRpc(client, 'update_session_item', {
    p_session_id: sessionId,
    p_item_id: itemId,
    p_status: status,
    p_seconds: Math.max(0, Math.round(seconds)),
  });
  return parse(studySessionSchema, data);
}

/** `order` must be a permutation of the session's activity ids. */
export async function reorderSession(client: AppSupabaseClient, sessionId: string, order: string[]): Promise<StudySession> {
  return parse(studySessionSchema, await callRpc(client, 'reorder_session', { p_session_id: sessionId, p_order: order }));
}

export async function finishSession(client: AppSupabaseClient, sessionId: string, status: 'completed' | 'abandoned'): Promise<StudySession> {
  return parse(studySessionSchema, await callRpc(client, 'finish_session', { p_session_id: sessionId, p_status: status }));
}

export async function getSessionRecap(client: AppSupabaseClient, sessionId: string): Promise<SessionMistake[]> {
  const data = await callRpc(client, 'session_recap', { p_session_id: sessionId });
  return parse(sessionRecapSchema, data ?? []);
}

export const SESSION_PAGE = '/app/phien-hoc';
export const LESSON_ROUTE = '/app/hoc-tap/bai';
export const REVIEW_ROUTE = '/app/on-tap';

/**
 * Where an activity is played, with `?phien=<session>&muc=<item>` so the lesson player / review returns to the
 * session when done. null for `recap` (a screen of SessionPage) and for a lesson activity without a lesson.
 */
export function sessionLink(session: Pick<StudySession, 'id'>, activity: Pick<SessionActivity, 'id' | 'kind' | 'lesson_id'>): string | null {
  const query = new URLSearchParams({ [SESSION_QUERY.session]: session.id, [SESSION_QUERY.item]: activity.id }).toString();
  switch (activity.kind) {
    case 'review':
      return `${REVIEW_ROUTE}?${query}`;
    case 'lesson':
    case 'practice':
      return activity.lesson_id ? `${LESSON_ROUTE}/${activity.lesson_id}?${query}` : null;
    case 'recap':
      return null;
  }
}

/** The first activity still to do, in the learner's order. */
export function firstPending(session: Pick<StudySession, 'plan'>): SessionActivity | null {
  return session.plan.activities.find((a) => a.status === 'pending') ?? null;
}

/** Activities done or skipped, out of all. */
export function sessionProgress(session: Pick<StudySession, 'plan'>): { finished: number; total: number } {
  const { activities } = session.plan;
  return { finished: activities.filter((a) => a.status !== 'pending').length, total: activities.length };
}
