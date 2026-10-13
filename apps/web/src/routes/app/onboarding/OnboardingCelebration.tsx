import { useEffect, useRef } from 'react';
import { LEVEL_INFO, type LevelCode } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { CountUp } from '@/components/ui/CountUp';
import { RouteLine } from '@/components/ui/RouteLine';
import type { LearningPath } from '@/features/learning-paths/service';
import { useMotionPrefs } from '@/providers/MotionProvider';

export function OnboardingCelebration({ path, onDone }: { path: LearningPath; onDone: () => void }) {
  const { reduceMotion } = useMotionPrefs();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const from = LEVEL_INFO[path.currentLevel as LevelCode].label;
  const to = LEVEL_INFO[path.targetLevel as LevelCode].label;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main id="main" className="mx-auto flex min-h-hero w-full max-w-md flex-col items-center justify-center gap-6 px-safe py-10 text-center">
      <RouteLine
        title={`Lộ trình từ ${from} tới ${to}`}
        viewBox="0 0 240 70"
        className="max-w-xs text-text"
        tracks={[
          {
            id: 'done',
            color: '#4CA2D1',
            d: 'M20 48 C80 0 150 80 220 22',
            stops: [
              { x: 20, y: 48, label: from, labelPosition: 'bottom', anchor: 'start' },
              { x: 220, y: 22, label: to, labelPosition: 'top', anchor: 'end' },
            ],
          },
        ]}
      />
      <h1 ref={headingRef} tabIndex={-1} className="text-[28px] font-bold tracking-[-0.03em] focus:outline-none">
        Lộ trình đã sẵn sàng!
      </h1>
      <p className="text-[17px] text-muted">
        Ước lượng khoảng <CountUp to={path.estimate.weeksMin} durationMs={reduceMotion ? 0 : 1200} />–
        <CountUp to={path.estimate.weeksMax} durationMs={reduceMotion ? 0 : 1200} /> tuần để đạt {to}.
      </p>
      <Button variant="accent" size="lg" onClick={onDone}>
        Vào trang chủ
      </Button>
    </main>
  );
}
