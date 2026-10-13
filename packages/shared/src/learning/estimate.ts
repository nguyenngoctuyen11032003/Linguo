export const FEASIBILITIES = ['no_deadline', 'feasible', 'tight', 'needs_more_time'] as const;
export type Feasibility = (typeof FEASIBILITIES)[number];

export interface ReferenceHours {
  levelCode: string;
  ordinal: number;
  cumulativeHours: number;
  reviewed: boolean;
}

export interface EstimateInput {
  currentLevel: string;
  targetLevel: string;
  weeklyMinutes: readonly number[];
  /** ISO date (YYYY-MM-DD) or null when there is no deadline. */
  targetDate: string | null;
  /** The user's local date, ISO. */
  today: string;
}

export interface EstimateResult {
  hoursNeeded: number;
  weeksMin: number;
  weeksMid: number;
  weeksMax: number;
  feasibility: Feasibility;
  suggestedMinutesPerDay: number | null;
  suggestedDate: string | null;
  assumptions: {
    weeklyMinutes: number;
    hoursNeeded: number;
    referenceReviewed: boolean;
    multiplierRange: readonly [number, number];
  };
}

export const ESTIMATE_MULTIPLIERS = [0.8, 1.3] as const;
export const MAX_MINUTES_PER_DAY = 720;
const DAY_MS = 86_400_000;

export class EstimateError extends Error {}

export function isoToUtcDays(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS;
}

export function addDaysIso(iso: string, days: number): string {
  return new Date((isoToUtcDays(iso) + days) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Reference-hours estimate. Integer arithmetic only (×4/5 and ×13/10 instead of ×0.8 / ×1.3) so the SQL
 * mirror `public.estimate_learning_path` produces identical numbers. Keep both in sync with
 * estimate.fixtures.json.
 */
export function estimatePath(input: EstimateInput, reference: readonly ReferenceHours[]): EstimateResult {
  const current = reference.find((r) => r.levelCode === input.currentLevel);
  const target = reference.find((r) => r.levelCode === input.targetLevel);
  if (!current || !target) throw new EstimateError('invalid_level');
  const weekly = input.weeklyMinutes.reduce((sum, m) => sum + m, 0);
  if (weekly <= 0) throw new EstimateError('invalid_schedule');

  const hoursNeeded = Math.max(0, target.cumulativeHours - current.cumulativeHours);
  const weeksMid = Math.ceil((hoursNeeded * 60) / weekly);
  const weeksMin = Math.ceil((weeksMid * 4) / 5);
  const weeksMax = Math.ceil((weeksMid * 13) / 10);

  let feasibility: Feasibility = 'no_deadline';
  let suggestedMinutesPerDay: number | null = null;
  let suggestedDate: string | null = null;
  if (input.targetDate) {
    const weeksAvailable = Math.floor((isoToUtcDays(input.targetDate) - isoToUtcDays(input.today)) / 7);
    if (weeksAvailable >= weeksMax) feasibility = 'feasible';
    else if (weeksAvailable >= weeksMid) feasibility = 'tight';
    else {
      feasibility = 'needs_more_time';
      const activeDays = Math.max(1, input.weeklyMinutes.filter((m) => m > 0).length);
      suggestedMinutesPerDay = Math.min(
        MAX_MINUTES_PER_DAY,
        Math.ceil((hoursNeeded * 60) / (Math.max(weeksAvailable, 1) * activeDays)),
      );
      suggestedDate = addDaysIso(input.today, weeksMid * 7);
    }
  }

  return {
    hoursNeeded,
    weeksMin,
    weeksMid,
    weeksMax,
    feasibility,
    suggestedMinutesPerDay,
    suggestedDate,
    assumptions: {
      weeklyMinutes: weekly,
      hoursNeeded,
      referenceReviewed: current.reviewed && target.reviewed,
      multiplierRange: ESTIMATE_MULTIPLIERS,
    },
  };
}
