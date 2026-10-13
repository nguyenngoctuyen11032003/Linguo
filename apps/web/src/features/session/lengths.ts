import { SESSION_LENGTHS, type SessionLength } from '@linguo/shared';

/** The length the "Rút gọn" button and the home "Chỉ có 10 phút?" link use. */
export const SHORT_SESSION_MINUTES: SessionLength = 10;

/** Query param of /app/phien-hoc that preselects a length, e.g. `?phut=10` from the home card. */
export const LENGTH_QUERY = 'phut';

/** A session length from the URL, or null when absent or not one of the chips. */
export function readLengthParam(params: URLSearchParams): SessionLength | null {
  const raw = params.get(LENGTH_QUERY);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return SESSION_LENGTHS.find((l) => l === Number(raw)) ?? null;
}
