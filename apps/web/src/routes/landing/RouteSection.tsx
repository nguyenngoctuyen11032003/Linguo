import { useRef } from 'react';
import { m as motion, useInView } from 'motion/react';
import { BookOpen, Headphones, MessageCircle, type LucideIcon } from 'lucide-react';
import { RouteLine, type RouteTrack } from '@/components/ui/RouteLine';
import { DUR, reveal, VIEWPORT_ONCE } from '@/design/motion';
import { useMotionPrefs } from '@/providers/MotionProvider';

const TRACKS: RouteTrack[] = [
  {
    id: 'en',
    color: '#4CA2D1',
    d: 'M28 50 C64 10 104 90 140 60 C180 30 220 100 260 70 C280 56 286 44 292 34',
    stops: [
      { x: 28, y: 50, label: 'Nền tảng', labelPosition: 'bottom', anchor: 'start' },
      { x: 140, y: 60, label: 'A1–A2', labelPosition: 'bottom' },
      { x: 260, y: 70, label: 'B1–B2', labelPosition: 'bottom' },
      { x: 292, y: 34, label: 'C1–C2', labelPosition: 'top', anchor: 'end' },
    ],
  },
  {
    id: 'ko',
    color: '#F37D25',
    d: 'M28 190 C72 230 110 140 150 170 C190 200 230 130 270 150 C284 160 290 172 292 186',
    stops: [
      { x: 28, y: 190, label: 'Hangul', labelPosition: 'top', anchor: 'start' },
      { x: 150, y: 170, label: 'TOPIK I', labelPosition: 'bottom' },
      { x: 270, y: 150, label: 'TOPIK II', labelPosition: 'top' },
      { x: 292, y: 186, label: 'Cấp 5–6', labelPosition: 'bottom', anchor: 'end' },
    ],
  },
  {
    id: 'ja',
    color: '#E85D8A',
    d: 'M28 290 C72 320 110 250 150 275 C190 300 230 240 270 260 C284 270 290 282 292 296',
    stops: [
      { x: 28, y: 290, label: 'Kana', labelPosition: 'top', anchor: 'start' },
      { x: 150, y: 275, label: 'JLPT N5–N4', labelPosition: 'bottom' },
      { x: 270, y: 260, label: 'N3–N1', labelPosition: 'top' },
      { x: 292, y: 296, label: 'N1', labelPosition: 'bottom', anchor: 'end' },
    ],
  },
];

// Badge centres as % of the 320x240 viewBox (x/320, y/240). Each sits in an empty pocket of the map, clear of both
// tracks, every stop and every stop label by >= ~26 viewBox units (badge radius <= 17.6 + 8px float travel).
//   Đọc (150,16) above the EN track; Nghe (212,118) and Nói (62,118) in the gap between the two tracks.
const FLOATERS: Array<{ icon: LucideIcon; label: string; left: string; top: string; duration: number }> = [
  { icon: BookOpen, label: 'Đọc', left: '46.9%', top: '4.8%', duration: 2.8 },
  { icon: Headphones, label: 'Nghe', left: '66.3%', top: '35.8%', duration: 3.3 },
  { icon: MessageCircle, label: 'Nói', left: '19.4%', top: '35.8%', duration: 2.5 },
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
      className="relative min-[1024px]:-scroll-mt-18 overflow-x-clip bg-[linear-gradient(180deg,#0B1420_0%,#10283C_40%,#173E5B_64%,#3A2A2A_84%,var(--bg)_100%)] px-safe py-[clamp(64px,12vh,120px)]"
    >
      <div ref={ref} className="mx-auto max-w-3xl min-[1024px]:grid min-[1024px]:max-w-5xl min-[1280px]:max-w-[1200px] min-[1024px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] min-[1024px]:grid-rows-[1fr_1fr] min-[1024px]:gap-x-16">
        <motion.div className="min-[1024px]:self-end min-[1024px]:pb-5" variants={reveal('fadeUp', reduceMotion)} initial="hidden" animate={state}>
          <h2 id="route-title" className="font-display text-[clamp(48px,14vw,88px)] font-extrabold uppercase leading-[0.92] text-white">
            Một lộ trình
          </h2>
          <p className="mt-4 text-[clamp(18px,5vw,26px)] leading-snug text-[#C9D6E2]">
            rõ ràng từ điểm xuất phát
            <br />
            điều chỉnh theo kết quả thật
          </p>
        </motion.div>

        <div className="relative mx-auto mt-10 w-full max-w-[560px] text-white min-[1024px]:col-start-2 min-[1024px]:row-span-2 min-[1024px]:row-start-1 min-[1024px]:mt-0 min-[1024px]:max-w-none min-[1024px]:self-center">
          <RouteLine title="Lộ trình tiếng Anh, tiếng Hàn và tiếng Nhật: từ nền tảng tới C1–C2, từ Hangul tới TOPIK II và từ Kana tới JLPT N1" viewBox="0 0 320 330" tracks={TRACKS} />
          {FLOATERS.map(({ icon: Icon, label, left, top, duration }, i) => (
            <motion.span
              key={label}
              aria-hidden="true"
              className="absolute inline-flex w-[11%] max-w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#0B1420] shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
              style={{ left, top, aspectRatio: '1 / 1' }}
              initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
              animate={state === 'shown' ? { opacity: 1, scale: 1, y: reduceMotion ? 0 : [0, -8, 0] } : { opacity: 0 }}
              transition={{
                opacity: { duration: reduceMotion ? DUR.fast : 0.4, delay: reduceMotion ? 0 : 0.8 + i * 0.15 },
                scale: { duration: 0.5, delay: reduceMotion ? 0 : 0.8 + i * 0.15 },
                y: { duration, repeat: Infinity, ease: 'easeInOut' },
              }}
            >
              <Icon className="size-[56%]" />
            </motion.span>
          ))}
        </div>

        <motion.ul className="mt-8 flex flex-wrap gap-3 text-sm font-medium text-white min-[1024px]:col-start-1 min-[1024px]:row-start-2 min-[1024px]:mt-0 min-[1024px]:self-start min-[1024px]:pt-5" variants={reveal('fadeUp', reduceMotion, 0.15)} initial="hidden" animate={state}>
          <li className="glass inline-flex min-h-10 items-center gap-2 rounded-full px-4">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-[#4CA2D1]" />
            EN · Tiếng Anh (CEFR)
          </li>
          <li className="glass inline-flex min-h-10 items-center gap-2 rounded-full px-4">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-[#F37D25]" />
            KO · Tiếng Hàn (TOPIK)
          </li>
          <li className="glass inline-flex min-h-10 items-center gap-2 rounded-full px-4">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-[#E85D8A]" />
            JA · Tiếng Nhật (JLPT)
          </li>
        </motion.ul>
      </div>
    </section>
  );
}
