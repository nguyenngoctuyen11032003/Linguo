import { m as motion } from 'motion/react';
import { EASE_OUT } from '@/design/motion';
import type { LessonStep } from '@/features/lesson-player/types';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { progressLabel } from './progress';

export function LessonProgress({ steps, stepIndex }: { steps: LessonStep[]; stepIndex: number }) {
  const { reduceMotion } = useMotionPrefs();
  const total = Math.max(steps.length, 1);
  const current = Math.min(stepIndex + 1, total);
  const label = progressLabel(steps, stepIndex);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        role="progressbar"
        aria-label="Tiến độ bài học"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={label}
        className="h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-text/10"
      >
        <motion.div
          className="relative h-full min-w-4 rounded-full bg-gradient-to-r from-primary to-accent after:absolute after:inset-x-2 after:top-1 after:h-1 after:rounded-full after:bg-white/35"
          initial={false}
          animate={{ width: `${(current / total) * 100}%` }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
        />
      </div>
      <p aria-hidden="true" className="shrink-0 text-xs font-bold tabular-nums text-muted">
        {label}
      </p>
    </div>
  );
}
