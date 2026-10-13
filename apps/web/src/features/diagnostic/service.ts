import {
  diagnosticReportSchema,
  diagnosticStatusSchema,
  diagnosticStepSchema,
  placementResultSchema,
  type DiagnosticMode,
  type DiagnosticReport,
  type DiagnosticSkill,
  type DiagnosticStatus,
  type DiagnosticStep,
  type PlacementResult,
  type SKIP_REASONS,
} from '@linguo/shared';
import { callRpc, LESSON_RPC_TIMEOUT_MS, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Spec 4 §4. Same transport as the lesson and review RPCs: jsonb validated with the shared zod contracts, abandoned
// after 15 s (an AbortError with status 0, which callers treat like a network failure). Nothing is measured on the
// client: the server stamps when each item was served and answered.

export const DIAGNOSTIC_RPC_TIMEOUT_MS = LESSON_RPC_TIMEOUT_MS;

export type SkipReason = (typeof SKIP_REASONS)[number];

export async function diagnosticStatus(client: AppSupabaseClient, pathId: string): Promise<DiagnosticStatus> {
  return parse(diagnosticStatusSchema, await callRpc(client, 'diagnostic_status', { p_path_id: pathId }));
}

/** Starts a new attempt, or resumes the one in progress (same pending item, `resumed: true`). */
export async function startDiagnostic(client: AppSupabaseClient, pathId: string, mode: DiagnosticMode = 'full'): Promise<DiagnosticStep> {
  return parse(diagnosticStepSchema, await callRpc(client, 'start_diagnostic', { p_path_id: pathId, p_mode: mode }));
}

/** `choice` null = "Tôi không biết". The response never says whether the answer was right. */
export async function answerDiagnostic(
  client: AppSupabaseClient,
  attemptId: string,
  itemId: string,
  choice: string | null,
): Promise<DiagnosticStep> {
  const data = await callRpc(client, 'answer_diagnostic', { p_attempt_id: attemptId, p_item_id: itemId, p_choice: choice });
  return parse(diagnosticStepSchema, data);
}

export async function skipDiagnosticSkill(
  client: AppSupabaseClient,
  attemptId: string,
  skill: DiagnosticSkill,
  reason: SkipReason,
): Promise<DiagnosticStep> {
  const data = await callRpc(client, 'skip_diagnostic_skill', { p_attempt_id: attemptId, p_skill: skill, p_reason: reason });
  return parse(diagnosticStepSchema, data);
}

/** Idempotent: a completed attempt returns its stored report. */
export async function finishDiagnostic(client: AppSupabaseClient, attemptId: string): Promise<DiagnosticReport> {
  return parse(diagnosticReportSchema, await callRpc(client, 'finish_diagnostic', { p_attempt_id: attemptId }));
}

export async function acceptPlacement(client: AppSupabaseClient, attemptId: string): Promise<PlacementResult> {
  return parse(placementResultSchema, await callRpc(client, 'accept_diagnostic_placement', { p_attempt_id: attemptId }));
}
