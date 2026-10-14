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
import { LandingNav } from './LandingNav';
import { useHeroReady, useVideoVisible } from './useHeroReady';

export function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { reduceMotion } = useMotionPrefs();
  const saveData = useSaveData();
  const videoUrl = !reduceMotion && !saveData ? env.heroVideoUrl : null;
  const ready = useHeroReady();
  const videoVisible = useVideoVisible(videoRef, Boolean(videoUrl));
  const state = ready ? 'shown' : 'hidden';

  return (
    <section aria-labelledby="hero-title" className="relative isolate flex min-h-hero flex-col overflow-x-clip">
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
      <LandingNav ready={ready} />

      <div className="mx-auto mt-auto w-full max-w-5xl px-safe pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] pt-28">
        <h1 id="hero-title" className="font-display text-[clamp(48px,14.5vw,124px)] uppercase leading-[0.95]">
          <motion.span className="block" variants={reveal('slideLeft', reduceMotion, 0)} initial="hidden" animate={state}>
            Học thông minh
          </motion.span>
          <motion.span className="block text-right text-primary" variants={reveal('slideRight', reduceMotion, 0.13)} initial="hidden" animate={state}>
            Nhớ lâu hơn
          </motion.span>
        </h1>
        <motion.p
          className="mt-5 max-w-md text-[17px] leading-relaxed text-muted"
          variants={reveal('blurUp', reduceMotion, 0.3)}
          initial="hidden"
          animate={state}
        >
          Lộ trình tiếng Anh và tiếng Hàn cá nhân hoá cho người Việt — học bằng{' '}
          <em className="font-serif text-[1.08em] text-text">nhớ lại chủ động</em>, ôn tập ngắt quãng và phản hồi có giải thích.
        </motion.p>
        <motion.div
          className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3"
          variants={reveal('blurUp', reduceMotion, 0.45)}
          initial="hidden"
          animate={state}
        >
          <ArrowCTA to="/dang-ky">Bắt đầu miễn phí</ArrowCTA>
          <Link to="/dang-nhap" className="inline-flex min-h-11 items-center px-2 text-[15px] font-semibold underline-offset-4 hover:underline">
            Tôi đã có tài khoản
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
