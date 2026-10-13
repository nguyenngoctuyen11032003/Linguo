import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { CountUp } from '@/components/ui/CountUp';
import { reveal, VIEWPORT_ONCE } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';

/** Product facts only — never user counts or outcomes we cannot back up. */
const STATS = [
  { value: 2, label: 'ngôn ngữ — tiếng Anh và tiếng Hàn', indent: false, gold: false },
  { value: 6, label: 'kỹ năng theo dõi riêng: từ vựng, ngữ pháp, đọc, nghe, viết, nói', indent: true, gold: false },
  { value: 12, label: 'cấp độ mục tiêu: CEFR A1–C2 và TOPIK 1–6', indent: false, gold: true },
];

export function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const state = inView || reduceMotion ? 'shown' : 'hidden';

  return (
    <section aria-label="Linguo trong con số" className="overflow-x-clip bg-bg px-safe pb-[clamp(64px,12vh,120px)]">
      <div ref={ref} className="mx-auto flex max-w-3xl flex-col gap-8">
        {STATS.map((s, i) => (
          <motion.div
            key={s.value}
            className={cn('flex items-end gap-4', s.indent && 'pl-[clamp(40px,12vw,120px)]')}
            variants={reveal(i % 2 ? 'slideRight' : 'slideLeft', reduceMotion, i * 0.12)}
            initial="hidden"
            animate={state}
          >
            <CountUp
              to={s.value}
              delayMs={i * 200}
              className={cn('font-display text-[clamp(84px,26vw,160px)] leading-[0.8]', s.gold ? 'text-gold' : 'text-gradient-fade')}
            />
            <p className="max-w-[14rem] pb-2 text-[clamp(14px,3.8vw,18px)] leading-snug text-muted">{s.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
