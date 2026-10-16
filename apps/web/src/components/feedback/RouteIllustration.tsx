import { useId } from 'react';
import { cn } from '@/lib/cn';

export type RouteIllustrationVariant = 'broken' | 'lost' | 'update' | 'empty';

/**
 * Decorative route-line scenes (the learning-path motif of Home's TodayCard) for error, 404, new-version and empty
 * states. Inline SVG coloured by theme tokens; gentle CSS motion from feedback.css, off under reduced motion.
 */
export function RouteIllustration({ variant, className }: { variant: RouteIllustrationVariant; className?: string }) {
  const id = useId().replace(/:/g, '');
  const grad = `lg-ill-${id}`;
  return (
    <svg viewBox="0 0 240 100" fill="none" aria-hidden="true" focusable="false" className={cn('block h-auto', className)}>
      <defs>
        <linearGradient id={grad} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" className="[stop-color:var(--primary)]" />
          <stop offset="1" className="[stop-color:var(--accent)]" />
        </linearGradient>
      </defs>
      {variant === 'broken' && <Broken grad={grad} />}
      {variant === 'lost' && <Lost grad={grad} />}
      {variant === 'update' && <Update grad={grad} />}
      {variant === 'empty' && <Empty />}
    </svg>
  );
}

function StartNode({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="10" className="fill-primary/15" />
      <circle cx={cx} cy={cy} r="6" className="fill-primary" />
      <circle cx={cx} cy={cy} r="2.4" className="fill-bg" />
    </g>
  );
}

/** A route that snaps mid-way: solid up to the break, a spark, then a faded dotted remainder. */
function Broken({ grad }: { grad: string }) {
  return (
    <>
      <path d="M20 72C56 72 70 44 104 40" stroke={`url(#${grad})`} strokeWidth="4" strokeLinecap="round" />
      <path d="M134 44C168 50 184 70 220 64" className="stroke-text/25" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 8" />
      {/* Snapped ends, slightly offset. */}
      <path d="M104 40l5-3" className="stroke-accent" strokeWidth="4" strokeLinecap="round" />
      <path d="M128 47l6-3" className="stroke-text/30" strokeWidth="3" strokeLinecap="round" />
      <g className="lg-ill-spark">
        <path d="M119 24l2.6 7.4 7.4 2.6-7.4 2.6-2.6 7.4-2.6-7.4-7.4-2.6 7.4-2.6z" className="fill-error" />
      </g>
      <circle cx="112" cy="54" r="2" className="fill-error/70" />
      <circle cx="127" cy="58" r="1.6" className="fill-accent/70" />
      <circle cx="122" cy="16" r="1.4" className="fill-error/50" />
      <StartNode cx={20} cy={72} />
      <circle cx="220" cy="64" r="7" className="fill-bg stroke-text/30" strokeWidth="2.5" strokeDasharray="3 3" />
    </>
  );
}

/** A route that wanders in a loop and ends at a question mark. */
function Lost({ grad }: { grad: string }) {
  return (
    <>
      <path
        d="M20 80C64 82 58 34 98 36C140 38 120 86 160 74C188 66 186 38 202 32"
        stroke={`url(#${grad})`}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="7 7"
        className="lg-ill-dash"
      />
      <StartNode cx={20} cy={80} />
      <g className="lg-ill-bob">
        <circle cx="214" cy="24" r="16" className="fill-accent" />
        <path d="M214 37l-5 8h10z" className="fill-accent" />
        <text
          x="214"
          y="31.5"
          textAnchor="middle"
          className="fill-on-accent font-display text-[22px] font-extrabold"
        >
          ?
        </text>
      </g>
    </>
  );
}

/** A route climbing to a glowing new stop: a fresh version is waiting. */
function Update({ grad }: { grad: string }) {
  return (
    <>
      <path d="M20 78C70 78 92 40 140 42S196 30 212 26" stroke={`url(#${grad})`} strokeWidth="4" strokeLinecap="round" />
      <path d="M20 78C70 78 92 40 140 42" className="stroke-text/10" strokeWidth="12" strokeLinecap="round" />
      <StartNode cx={20} cy={78} />
      <circle cx="116" cy="46" r="5" className="fill-primary stroke-bg" strokeWidth="2.5" />
      <circle cx="212" cy="26" r="11" className="lg-ill-pulse fill-accent/40" />
      <circle cx="212" cy="26" r="12" className="fill-accent" />
      <path d="M212 32V20m-5 5l5-5 5 5" className="stroke-on-accent" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <g className="lg-ill-spark">
        <path d="M186 8l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" className="fill-accent" />
      </g>
      <path d="M232 46l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1z" className="fill-primary" />
    </>
  );
}

/** A quiet dotted route between two faint stops (the icon badge sits on top, in the middle). */
function Empty() {
  return (
    <>
      <path d="M14 58C60 58 70 46 120 46S180 34 226 34" className="stroke-primary/35" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0.1 7" />
      <circle cx="14" cy="58" r="5" className="fill-primary/40" />
      <circle cx="226" cy="34" r="5" className="fill-accent/45" />
    </>
  );
}
