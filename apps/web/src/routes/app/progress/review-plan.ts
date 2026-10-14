import type { Mistake, PlanReviewRequestInput, ProgressDashboard } from '@linguo/shared';
import { EXERCISE_TYPE_LABELS } from './labels';

/** At most this many gaps of each kind (the contract allows 10 in all). */
export const PLAN_GAP_LIMITS = { lessons: 6, tags: 4 } as const;
/** Exercise types answered right less often than this (with enough attempts) count as a gap. */
const WEAK_ACCURACY = 0.8;

type PlanGap = Extract<PlanReviewRequestInput, { task: 'plan_review' }>['gaps'][number];

const clip = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
};

function lessonGaps(mistakes: readonly Mistake[]): PlanGap[] {
  const byLesson = new Map<string, { label: string; count: number }>();
  for (const m of mistakes) {
    const row = byLesson.get(m.lesson_id) ?? { label: clip(m.lesson_title, 80), count: 0 };
    row.count += m.wrong_count;
    byLesson.set(m.lesson_id, row);
  }
  return [...byLesson]
    .filter(([id, row]) => /^[A-Za-z0-9_-]{1,64}$/.test(id) && row.label)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, PLAN_GAP_LIMITS.lessons)
    .map(([id, row]) => ({ kind: 'lesson', id, label: row.label, count: Math.min(999, row.count) }));
}

function tagGaps(types: ProgressDashboard['exercise_types']): PlanGap[] {
  return types
    .flatMap((t) => {
      if (t.accuracy === null || t.accuracy >= WEAK_ACCURACY) return [];
      const wrong = t.attempts - Math.round(t.attempts * t.accuracy);
      return wrong > 0 ? [{ kind: 'tag' as const, id: t.exercise_type, label: EXERCISE_TYPE_LABELS[t.exercise_type], count: Math.min(999, wrong) }] : [];
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, PLAN_GAP_LIMITS.tags);
}

/**
 * The `plan_review` request built from data the Progress page already has: lessons with repeated mistakes and
 * exercise types answered poorly. Question text is never sent. Null when there is nothing to plan.
 */
export function buildPlanReviewRequest(
  dashboard: Pick<ProgressDashboard, 'mistakes' | 'exercise_types'>,
  learner: { language: 'en' | 'ko'; level: string },
): Extract<PlanReviewRequestInput, { task: 'plan_review' }> | null {
  const gaps = [...lessonGaps(dashboard.mistakes), ...tagGaps(dashboard.exercise_types)];
  if (gaps.length === 0) return null;
  return { task: 'plan_review', language: learner.language, level: learner.level, gaps };
}
