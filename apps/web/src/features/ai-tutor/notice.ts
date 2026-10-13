import { z } from 'zod';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

/** When the user acknowledged the AI privacy notice (`user_preferences.ai_notice_ack_at`), or null. */
export async function fetchAiNoticeAck(client: AppSupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await client.from('user_preferences').select('ai_notice_ack_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.ai_notice_ack_at ?? null;
}

/** Records the acknowledgement server-side (`ack_ai_notice`) and returns its timestamp. */
export async function ackAiNotice(client: AppSupabaseClient): Promise<string> {
  return parse(z.string().min(1), await callRpc(client, 'ack_ai_notice', {}));
}
