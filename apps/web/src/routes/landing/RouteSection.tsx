import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { BookOpen, Headphones, MessageCircle, type LucideIcon } from 'lucide-react';
import { RouteLine, type RouteTrack } from '@/components/ui/RouteLine';
import { reveal, VIEWPORT_ONCE } from '@/design/motion';
import { useMotionPrefs } from '@/providers/MotionProvider';

const TRACKS: RouteTrack[] = [
  {
    id: 'en',
    color: '#4CA2D1',
    d: 'M20 50 C60 10 100 90 140 60 C180 30 220 100 260 70 C285 52 295 40 304 34',
    stops: [
      { x: 20, y: 50, label: 'Nền tảng', labelPosition: 'bottom' },
      { x: 140, y: 60, label: 'A1–A2', labelPosition: 'bottom' },
      { x: 260, y: 70, label: 'B1–B2', labelPosition: 'bottom' },
      { x: 304, y: 34, label: 'C1–C2', labelPosition: 'top' },
    ],
  },
  {
    id: 'ko',
    color: '#F37D25',
    d: 'M20 190 C70 230 110 140 150 170 C190 200 230 130 270 150 C290 160 298 172 304 186',
    stops: [
      { x: 20, y: 190, label: 'Hangul', labelPosition: 'top' },
      { x: 150, y: 170, label: 'TOPIK I', labelPosition: 'bottom' },
      { x: 270, y: 150, label: 'TOPIK II', labelPosition: 'top' },
      { x: 304, y: 186, label: 'Cấp 5–6', labelPosition: 'bottom' },
    ],
  },
];

const FLOATERS: Array<{ icon: LucideIcon; label: string; left: string; top: string; duration: number }> = [
  { icon: BookOpen, label: 'Đọc', left: '30%', top: '8%', duration: 2.8 },
  { icon: Headphones, label: 'Nghe', left: '68%', top: '40%', duration: 3.3 },
  { icon: MessageCircle, label: 'Nói', left: '12%', top: '62%', duration: 2.5 },
];

export function RouteSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const state = inView || reduceMotion ? 'shown' : 'hidden';

  return (
    <section
      id="lo-trinh"
      aria-labelledby="route-title"
      className="relative overflow-x-clip bg-[linear-gradient(180deg,#0B1420_0%,#10283C_45%,#173E5B_75%,#3A2A2A_100%)] px-safe py-[clamp(64px,12vh,120px)]"
    >
      <div ref={ref} className="mx-auto max-w-3xl">
        <motion.div variants={reveal('slideLeft', reduceMotion)} initial="hidden" animate={state}>
          <h2 id="route-title" className="font-display text-[clamp(44px,13vw,80px)] uppercase leading-[0.95] text-white">
            Một lộ trình
          </h2>
          <p className="mt-2 text-[clamp(18px,5vw,26px)] leading-snug text-[#C9D6E2]">
            rõ ràng từ điểm xuất phát
            <br />
            điều chỉnh theo kết quả thật
          </p>
        </motion.div>

        <div className="relative -mx-2 mt-10 text-white">
          <RouteLine title="Lộ trình tiếng Anh và tiếng Hàn: từ nền tảng tới C1–C2 và từ Hangul tới TOPIK II" viewBox="0 0 320 240" tracks={TRACKS} />
          {FLOATERS.map(({ icon: Icon, label, left, top, duration }, i) => (
            <motion.span
              key={label}
              aria-hidden="true"
              className="absolute inline-flex w-[13%] max-w-14 items-center justify-center rounded-full bg-white p-[3%] text-[#0B1420] shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
              style={{ left, top, aspectRatio: '1 / 1' }}
              initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
              animate={state === 'shown' ? { opacity: 1, scale: 1, y: reduceMotion ? 0 : [0, -8, 0] } : { opacity: 0 }}
              transition={{
                opacity: { duration: 0.4, delay: reduceMotion ? 0 : 0.8 + i * 0.15 },
                scale: { duration: 0.5, delay: reduceMotion ? 0 : 0.8 + i * 0.15 },
                y: { duration, repeat: Infinity, ease: 'easeInOut' },
              }}
            >
              <Icon className="size-full" />
            </motion.span>
          ))}
        </div>

        <ul className="mt-8 flex flex-wrap gap-3 text-sm font-medium text-white">
          <li className="glass inline-flex min-h-10 items-center gap-2 rounded-full px-4">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-[#4CA2D1]" />
            EN · Tiếng Anh (CEFR)
          </li>
          <li className="glass inline-flex min-h-10 items-center gap-2 rounded-full px-4">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-[#F37D25]" />
            KO · Tiếng Hàn (TOPIK)
          </li>
        </ul>
      </div>
    </section>
  );
}
