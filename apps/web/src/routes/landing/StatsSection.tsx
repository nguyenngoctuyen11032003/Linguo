import { useRef } from 'react';
import { m as motion, useInView } from 'motion/react';
import { CountUp } from '@/components/ui/CountUp';
import { reveal, VIEWPORT_ONCE } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';

/** Product facts only — never user counts or outcomes we cannot back up. */
const STATS = [
  { value: 3, tag: 'Ngôn ngữ', label: 'ngôn ngữ — tiếng Anh, tiếng Hàn và tiếng Nhật', short: 'Tiếng Anh · Tiếng Hàn · Tiếng Nhật', gold: false },
  { value: 6, tag: 'Kỹ năng', label: 'kỹ năng theo dõi riêng: từ vựng, ngữ pháp, đọc, nghe, viết, nói', short: 'Từ vựng · ngữ pháp · đọc · nghe · viết · nói', gold: false },
  { value: 17, tag: 'Cấp độ', label: 'cấp độ mục tiêu: CEFR A1–C2, TOPIK 1–6 và JLPT N5–N1', short: 'CEFR A1–C2 · TOPIK 1–6 · JLPT N5–N1', gold: true },
];

export function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const state = inView || reduceMotion ? 'shown' : 'hidden';

  return (
    <section aria-label="Linguo trong con số" className="overflow-x-clip bg-bg px-safe pb-[clamp(64px,12vh,120px)]">
      <div ref={ref} className="mx-auto max-w-3xl min-[1024px]:max-w-5xl min-[1280px]:max-w-[1200px]">
        <p aria-hidden="true" className="eyebrow mb-4">
          Trong con số
        </p>
        <ul className="divide-y divide-white/10 border-y border-white/10 min-[1024px]:grid min-[1024px]:grid-cols-3 min-[1024px]:divide-x min-[1024px]:divide-y-0">
          {STATS.map((s, i) => (
            <motion.li
              key={s.value}
              className={cn('grid grid-cols-[minmax(0,auto)_1fr] items-end gap-x-5 py-6', i === 1 && 'sm:max-[1023px]:pl-[clamp(40px,12vw,120px)]', 'min-[1024px]:px-5 min-[1024px]:first:pl-0')}
              variants={reveal('fadeUp', reduceMotion, i * 0.1)}
              initial="hidden"
              animate={state}
            >
              <CountUp
                to={s.value}
                delayMs={i * 200}
                className={cn(
                  'stat-num min-w-[1.1ch] pr-1 text-[clamp(96px,30vw,176px)] min-[1024px]:text-[clamp(104px,10vw,160px)]',
                  s.gold ? 'bg-gradient-to-b from-gold to-gold/25 bg-clip-text text-transparent' : 'text-gradient-fade',
                )}
              />
              <div className="pb-2">
                <p aria-hidden="true" className={cn('font-display text-[22px] font-extrabold uppercase leading-none', s.gold ? 'text-gold' : 'text-text')}>
                  {s.tag}
                </p>
                <p className="sr-only">{s.label}</p>
                <p aria-hidden="true" className="mt-2 max-w-[16rem] text-[clamp(13px,3.6vw,15px)] leading-snug text-muted">
                  {s.short}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
