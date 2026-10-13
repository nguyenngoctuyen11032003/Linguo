import type { LessonStep } from '@/features/lesson-player/types';

/** Exercise steps up to and including `index` (re-checks count), out of all exercise steps. */
export function questionPosition(steps: LessonStep[], index: number): { current: number; total: number } {
  let current = 0;
  let total = 0;
  steps.forEach((step, i) => {
    if (step.kind !== 'exercise') return;
    total += 1;
    if (i <= index) current += 1;
  });
  return { current, total };
}

/** "Bước 4/9 · Câu 3/8" (the question part only when the lesson has exercises). */
export function progressLabel(steps: LessonStep[], index: number): string {
  const step = `Bước ${index + 1}/${steps.length}`;
  const { current, total } = questionPosition(steps, index);
  return total > 0 ? `${step} · Câu ${current}/${total}` : step;
}
