import {
  myReportSchema,
  REPORT_RULES,
  reportContentResultSchema,
  type MyReport,
  type ReportContentResult,
  type ReportReason,
  type ReportTargetKind,
} from '@linguo/shared';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Spec 11 §2. report_content / list_my_reports are not in the generated Database types yet: callRpc goes through an
// untyped cast and the shared zod contract validates every answer.

export interface ReportContentInput {
  targetKind: ReportTargetKind;
  targetId: string;
  reason: ReportReason;
  /** Optional free text; blank becomes null, longer than REPORT_RULES.note_max is rejected locally. */
  note?: string | null;
}

export const MY_REPORTS_DEFAULT_LIMIT = 50;

export async function reportContent(client: AppSupabaseClient, input: ReportContentInput): Promise<ReportContentResult> {
  const note = input.note?.trim() || null;
  if (note && note.length > REPORT_RULES.note_max) throw new Error('note_too_long');
  const data = await callRpc(client, 'report_content', {
    p_target_kind: input.targetKind,
    p_target_id: input.targetId,
    p_reason: input.reason,
    p_note: note,
  });
  return parse(reportContentResultSchema, data);
}

export async function listMyReports(client: AppSupabaseClient, limit: number = MY_REPORTS_DEFAULT_LIMIT): Promise<MyReport[]> {
  const data = await callRpc(client, 'list_my_reports', { p_limit: limit });
  return parse(myReportSchema.array(), data ?? []);
}
