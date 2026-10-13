import { aiQuotaSchema } from '@linguo/shared';
import type { z } from 'zod';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

export type AiQuota = z.infer<typeof aiQuotaSchema>;

/**
 * Display-only default for `ai_quota_status(p_limit)`. The real limit lives in the function's
 * `GEMINI_DAILY_USER_LIMIT` secret; every `ai-tutor` answer carries the authoritative quota, which replaces this.
 */
export const AI_QUOTA_DEFAULT_LIMIT = 20;

export async function getAiQuotaStatus(client: AppSupabaseClient, limit: number = AI_QUOTA_DEFAULT_LIMIT): Promise<AiQuota> {
  return parse(aiQuotaSchema, await callRpc(client, 'ai_quota_status', { p_limit: limit }));
}

export function remainingOf(quota: AiQuota): number {
  return Math.max(0, quota.limit - quota.used);
}

type Listener = (quota: AiQuota | null) => void;
const listeners = new Set<Listener>();

/** Subscribe to finished `ai-tutor` runs; the quota of the answer, or null when it carried none. */
export function subscribeAiRuns(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by `useAiTutor` after every run so quota chips update without a page reload. */
export function notifyAiRun(quota: AiQuota | null): void {
  for (const listener of [...listeners]) listener(quota);
}
