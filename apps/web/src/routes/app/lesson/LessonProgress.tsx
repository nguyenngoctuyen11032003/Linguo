import { motion } from 'motion/react';
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
    <div className="min-w-0 flex-1 space-y-1">
      <div
        role="progressbar"
        aria-label="Tiến độ bài học"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={label}
        className="h-2 overflow-hidden rounded-full bg-text/10"
      >
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={false}
          animate={{ width: `${(current / total) * 100}%` }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
        />
      </div>
      <p aria-hidden="true" className="text-xs font-medium text-muted">
        {label}
      </p>
    </div>
  );
}
