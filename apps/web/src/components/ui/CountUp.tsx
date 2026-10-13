import { useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { VIEWPORT_ONCE } from '@/design/motion';
import { useMotionPrefs } from '@/providers/MotionProvider';

interface CountUpProps {
  to: number;
  durationMs?: number;
  delayMs?: number;
  suffix?: string;
  className?: string;
}

const format = (n: number) => n.toLocaleString('vi-VN');

/** F1-style count-up (cubic ease-out). Screen readers always get the final value. */
export function CountUp({ to, durationMs = 2200, delayMs = 0, suffix = '', className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const [value, setValue] = useState(0);
  const shown = reduceMotion ? to : value;

  useEffect(() => {
    if (reduceMotion || !inView) return;
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [inView, reduceMotion, to, durationMs, delayMs]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true">
        {format(shown)}
        {suffix}
      </span>
      <span className="sr-only">
        {format(to)}
        {suffix}
      </span>
    </span>
  );
}
