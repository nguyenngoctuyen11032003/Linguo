import { SESSION_LENGTHS, type SessionLength } from '@linguo/shared';

/** The session length chip closest to today's goal (ties go to the shorter one: no pressure). */
export function defaultSessionLength(goalMinutes: number): SessionLength {
  let best: SessionLength = SESSION_LENGTHS[0];
  for (const length of SESSION_LENGTHS) {
    if (Math.abs(length - goalMinutes) < Math.abs(best - goalMinutes)) best = length;
  }
  return best;
}

/** The length the "Rút gọn" button shortens to. */
export const SHORT_SESSION_MINUTES: SessionLength = 10;
