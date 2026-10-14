import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { m as motion } from 'motion/react';
import { EXPO_OUT } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';

const MotionLink = motion.create(Link);

interface ArrowCTAProps {
  to: string;
  children: ReactNode;
  className?: string;
}

/** CARGOX-style pill CTA: orange pill with a round end holding an arrow that straightens on hover. */
export function ArrowCTA({ to, children, className }: ArrowCTAProps) {
  const { reduceMotion } = useMotionPrefs();
  const pill = reduceMotion
    ? { rest: {}, hover: {}, tap: {} }
    : { rest: { scale: 1, y: 0 }, hover: { scale: 1.04, y: -2 }, tap: { scale: 0.97 } };
  const arrow = reduceMotion ? { rest: { rotate: 0 }, hover: { rotate: 0 } } : { rest: { rotate: -45 }, hover: { rotate: 0 } };

  return (
    <MotionLink
      to={to}
      variants={pill}
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileFocus="hover"
      whileTap="tap"
      transition={{ duration: 0.35, ease: EXPO_OUT }}
      className={cn(
        'inline-flex min-h-14 items-center gap-4 rounded-full bg-accent py-1.5 pl-6 pr-1.5 text-[17px] font-semibold text-on-accent',
        'shadow-[0_12px_32px_-12px_rgb(243_125_37/0.75)]',
        className,
      )}
    >
      <span>{children}</span>
      <motion.span
        aria-hidden="true"
        variants={arrow}
        transition={{ duration: 0.35, ease: EXPO_OUT }}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0B1420] text-white"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </motion.span>
    </MotionLink>
  );
}
