import { AI_REPORT_REASONS } from '@linguo/shared';
import { z } from 'zod';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

export type AiReportReason = (typeof AI_REPORT_REASONS)[number];
export const AI_REPORT_NOTE_MAX = 500;

export interface AiReportInput {
  /** `response_id` of the answer (the `ai_usage` row id). */
  usageId: string;
  reason: AiReportReason;
  note?: string | null;
}

/** Reports an AI answer (`ai_report`); returns the report id. Throws the supabase error, or `invalid_payload`. */
export async function reportAiResponse(client: AppSupabaseClient, input: AiReportInput): Promise<string> {
  if (!AI_REPORT_REASONS.includes(input.reason)) throw new Error('invalid_reason');
  const note = input.note?.trim() ?? '';
  if (note.length > AI_REPORT_NOTE_MAX) throw new Error('invalid_note');
  const data = await callRpc(client, 'ai_report', {
    p_usage_id: input.usageId,
    p_reason: input.reason,
    p_note: note || null,
  });
  return parse(z.string().min(1), data);
}
