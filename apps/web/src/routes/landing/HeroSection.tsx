import { useRef } from 'react';
import { m as motion } from 'motion/react';
import { Link } from 'react-router';
import { ArrowCTA } from '@/components/ui/ArrowCTA';
import { reveal } from '@/design/motion';
import { cn } from '@/lib/cn';
import { env } from '@/lib/env';
import { useSaveData } from '@/lib/useSaveData';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { HeroBackdrop } from './HeroBackdrop';
import { useVideoVisible } from './useHeroReady';

const LANG_CARDS = [
  { code: 'EN', name: 'Tiếng Anh', exam: 'CEFR', range: 'A1 → C2', dot: 'bg-primary' },
  { code: 'KO', name: 'Tiếng Hàn', exam: 'TOPIK', range: 'Hangul → Cấp 6', dot: 'bg-accent' },
  { code: 'JA', name: 'Tiếng Nhật', exam: 'JLPT', range: 'Kana → N1', dot: 'bg-[#E85D8A]' },
];

/** Laptop-only right rail: one glass card per language. Decorative summary, the copy is already in the hero text. */
function LanguageCards({ state, reduceMotion }: { state: 'shown' | 'hidden'; reduceMotion: boolean }) {
  return (
    <ul aria-hidden="true" className="hidden min-[1024px]:flex min-[1024px]:flex-col min-[1024px]:gap-4">
      {LANG_CARDS.map((c, i) => (
        <motion.li
          key={c.code}
          className="glass flex items-center gap-4 rounded-3xl p-5 shadow-[var(--card-sheen),var(--shadow-dock)]"
          variants={reveal('slideRight', reduceMotion, 0.25 + i * 0.1)}
          initial="hidden"
          animate={state}
        >
          <span className={cn('inline-flex size-12 items-center justify-center rounded-2xl font-display text-xl font-extrabold text-black/80', c.dot)}>
            {c.code}
          </span>
          <span className="min-w-0">
            <span className="block text-[17px] font-bold leading-tight">{c.name}</span>
            <span className="mt-0.5 block text-sm text-muted">
              {c.exam} · {c.range}
            </span>
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

/** `ready` is owned by LandingPage (it also gates the nav entrance); the nav lives outside this section on purpose. */
export function HeroSection({ ready }: { ready: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { reduceMotion } = useMotionPrefs();
  const saveData = useSaveData();
  const videoUrl = !reduceMotion && !saveData ? env.heroVideoUrl : null;
  const videoVisible = useVideoVisible(videoRef, Boolean(videoUrl));
  const state = ready ? 'shown' : 'hidden';

  return (
    <section aria-labelledby="hero-title" className="relative isolate flex min-h-hero flex-col overflow-x-clip pt-[calc(4.5rem+env(safe-area-inset-top,0px))] min-[1024px]:pt-0">
      <HeroBackdrop />
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          className={cn('absolute inset-0 -z-10 h-full w-full object-cover transition-opacity duration-1000', videoVisible ? 'opacity-55' : 'opacity-0')}
        />
      )}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-b from-transparent to-bg" />

      <div className="mt-auto w-full px-safe pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] pt-10 min-[1024px]:pb-14 min-[1024px]:pt-32">
        <div className="mx-auto max-w-5xl min-[1024px]:grid min-[1024px]:grid-cols-[minmax(0,1fr)_340px] min-[1024px]:items-end min-[1024px]:gap-x-14 min-[1280px]:max-w-[1200px]">
        <div className="min-w-0">
        <motion.p
          className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/8 py-1.5 pl-1.5 pr-3.5 max-[359px]:pr-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white/80 ring-1 ring-white/12 ring-inset backdrop-blur"
          variants={reveal('fadeUp', reduceMotion, 0)}
          initial="hidden"
          animate={state}
        >
          <span className="inline-flex gap-1" aria-hidden="true">
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] tracking-[0.06em] text-on-primary">EN</span>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] tracking-[0.06em] text-on-accent">KO</span>
            <span className="rounded-full bg-[#C9255F] px-2 py-0.5 text-[11px] tracking-[0.06em] text-white">JA</span>
            <span className="rounded-full bg-[#3F3F46] px-2 py-0.5 text-[11px] tracking-[0.06em] text-white">DE</span>
          </span>
          <span className="max-[359px]:sr-only">Tiếng Anh · Hàn · Nhật · Đức</span>
        </motion.p>
        <h1 id="hero-title" className="font-display text-[clamp(40px,14vw,136px)] min-[1024px]:text-[clamp(64px,7.6vw,120px)] font-extrabold uppercase leading-[0.92] tracking-[-0.01em]">
          <motion.span className="block whitespace-nowrap" variants={reveal('slideLeft', reduceMotion, 0)} initial="hidden" animate={state}>
            Học thông minh
          </motion.span>
          <motion.span
            className="block whitespace-nowrap bg-gradient-to-r from-primary via-[#8fd0f2] to-accent bg-clip-text pb-[0.04em] text-right text-transparent"
            variants={reveal('slideRight', reduceMotion, 0.13)}
            initial="hidden"
            animate={state}
          >
            Nhớ lâu hơn
          </motion.span>
        </h1>
        <motion.p
          className="mt-5 max-w-md text-[17px] leading-relaxed text-muted"
          variants={reveal('rise', reduceMotion, 0.1)}
          initial="hidden"
          animate={state}
        >
          Lộ trình tiếng Anh, tiếng Hàn, tiếng Nhật và tiếng Đức cá nhân hoá cho người Việt — học bằng{' '}
          <em className="font-serif text-[1.08em] text-text">nhớ lại chủ động</em>, ôn tập ngắt quãng và phản hồi có giải thích.
        </motion.p>
        <motion.div
          className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3"
          variants={reveal('rise', reduceMotion, 0.2)}
          initial="hidden"
          animate={state}
        >
          <ArrowCTA to="/dang-ky">Bắt đầu miễn phí</ArrowCTA>
          <Link to="/dang-nhap" className="inline-flex min-h-11 items-center px-2 text-[15px] font-semibold underline-offset-4 hover:underline">
            Tôi đã có tài khoản
          </Link>
        </motion.div>
        </div>
        <LanguageCards state={state} reduceMotion={reduceMotion} />
        </div>
      </div>
    </section>
  );
}
