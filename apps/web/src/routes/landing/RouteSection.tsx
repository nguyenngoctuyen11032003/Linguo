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
];

// Badge centres as % of the 320x240 viewBox (x/320, y/240). Each sits in an empty pocket of the map, clear of both
// tracks, every stop and every stop label by >= ~26 viewBox units (badge radius <= 17.6 + 8px float travel).
//   Đọc (150,16) above the EN track; Nghe (212,118) and Nói (62,118) in the gap between the two tracks.
const FLOATERS: Array<{ icon: LucideIcon; label: string; left: string; top: string; duration: number }> = [
  { icon: BookOpen, label: 'Đọc', left: '46.9%', top: '6.7%', duration: 2.8 },
  { icon: Headphones, label: 'Nghe', left: '66.3%', top: '49.2%', duration: 3.3 },
  { icon: MessageCircle, label: 'Nói', left: '19.4%', top: '49.2%', duration: 2.5 },
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
          <h2 id="route-title" className="font-display text-[clamp(48px,14vw,88px)] font-extrabold uppercase leading-[0.92] text-white">
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
