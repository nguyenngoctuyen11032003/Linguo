import { useContext } from 'react';
import { aiErrorMessage } from '@/features/ai-tutor/error-map';
import type { AiQuota } from '@/features/ai-tutor/quota';
import { ProfileContext } from '@/features/profile/ProfileProvider';

export interface QuotaGate {
  /** Today's AI turns are all used: submitting would only fail, so the submit button is disabled. */
  exhausted: boolean;
  /** Why submitting is off and when it comes back; null while there are turns left. */
  hint: string | null;
}

/** Disables AI submit buttons once the daily quota is used up, with a hint that says when it resets. */
export function useQuotaGate(quota: AiQuota | null | undefined): QuotaGate {
  const timeZone = useContext(ProfileContext)?.profile?.timezone;
  if (!quota || quota.limit <= 0 || quota.used < quota.limit) return { exhausted: false, hint: null };
  const message = aiErrorMessage({ error: 'quota_exceeded', message: '', retry_after_sec: null, quota }, { timeZone });
  return { exhausted: true, hint: message };
}
