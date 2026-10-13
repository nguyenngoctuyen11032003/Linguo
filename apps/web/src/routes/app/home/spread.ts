import type { LearningPath } from '@/features/learning-paths/service';

const MIN_AVERAGE_MINUTES = 15;

/** PRD 2.1E: two active languages, each averaging under 15 minutes a day. */
export function needsSpreadWarning(paths: readonly LearningPath[]): boolean {
  const active = paths.filter((p) => p.status === 'active');
  return active.length >= 2 && active.every((p) => p.weeklyMinutes.reduce((s, m) => s + m, 0) / 7 < MIN_AVERAGE_MINUTES);
}
