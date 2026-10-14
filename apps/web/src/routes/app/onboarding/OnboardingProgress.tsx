import { m as motion } from 'motion/react';
import { EASE_OUT } from '@/design/motion';
import { useMotionPrefs } from '@/providers/MotionProvider';

export function OnboardingProgress({ current, total }: { current: number; total: number }) {
  const { reduceMotion } = useMotionPrefs();
  return (
    <div
      role="progressbar"
      aria-label="Tiến độ tạo lộ trình"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-valuetext={`Bước ${current} trên ${total}`}
      className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-text/10"
    >
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={false}
        animate={{ width: `${(current / total) * 100}%` }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
      />
    </div>
  );
}
