import { useId, useRef, useState } from 'react';
import { motion, useInView } from 'motion/react';
import { EXPO_OUT, SPRING_POP, VIEWPORT_ONCE } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';

export interface RouteStop {
  x: number;
  y: number;
  label: string;
  labelPosition?: 'top' | 'bottom' | 'left' | 'right';
  /** Horizontal text anchor for top/bottom labels. `start`/`end` keep a label inside the viewBox edge (aligned with the stop's rim). Default `middle`. */
  anchor?: 'start' | 'middle' | 'end';
}

export interface RouteTrack {
  id: string;
  d: string;
  color: string;
  stops: RouteStop[];
}

interface RouteLineProps {
  title: string;
  viewBox: string;
  tracks: RouteTrack[];
  className?: string;
}

const STOP_RADIUS = 7;

function labelProps(stop: RouteStop) {
  const anchor = stop.anchor ?? 'middle';
  const x = anchor === 'start' ? stop.x - STOP_RADIUS : anchor === 'end' ? stop.x + STOP_RADIUS : stop.x;
  switch (stop.labelPosition ?? 'top') {
    case 'bottom':
      return { x, y: stop.y + 22, textAnchor: anchor };
    case 'left':
      return { x: stop.x - 12, y: stop.y + 4, textAnchor: 'end' as const };
    case 'right':
      return { x: stop.x + 12, y: stop.y + 4, textAnchor: 'start' as const };
    default:
      return { x, y: stop.y - 13, textAnchor: anchor };
  }
}

/** CARGOX-style route map used as the "learning path" metaphor: lines draw in, stops pop, arrows travel. */
export function RouteLine({ title, viewBox, tracks, className }: RouteLineProps) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const drawn = reduceMotion || inView;
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  // SMIL `begin` counts from document load, so each travelling arrow only mounts once its own track has finished drawing.
  const [arrived, setArrived] = useState<Record<string, boolean>>({});

  return (
    <svg ref={ref} viewBox={viewBox} role="img" aria-label={title} className={cn('h-auto w-full overflow-visible', className)}>
      {tracks.map((track, ti) => {
        const pathId = `${prefix}-route-${track.id}`;
        return (
          <g key={track.id}>
            <path d={track.d} fill="none" stroke={track.color} strokeOpacity={0.18} strokeWidth={7} strokeLinecap="round" />
            <motion.path
              id={pathId}
              d={track.d}
              fill="none"
              stroke={track.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              initial={{ pathLength: reduceMotion ? 1 : 0 }}
              animate={{ pathLength: drawn ? 1 : 0 }}
              transition={{ duration: reduceMotion ? 0 : 1.6, ease: EXPO_OUT, delay: ti * 0.25 }}
              onAnimationComplete={() => {
                if (drawn && !reduceMotion) setArrived((prev) => (prev[track.id] ? prev : { ...prev, [track.id]: true }));
              }}
            />
            {!reduceMotion && arrived[track.id] && (
              <polygon points="0,-4 8,0 0,4" fill={track.color}>
                <animateMotion dur={`${7 + ti}s`} begin="0s" repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </polygon>
            )}
            {track.stops.map((stop, si) => (
              <motion.g
                key={`${stop.x},${stop.y}`}
                initial={reduceMotion ? false : { opacity: 0, scale: 0 }}
                animate={drawn ? { opacity: 1, scale: 1 } : { opacity: 0 }}
                transition={{ duration: 0.5, ease: SPRING_POP, delay: reduceMotion ? 0 : 0.4 + ti * 0.25 + si * 0.15 }}
                style={{ transformOrigin: `${stop.x}px ${stop.y}px`, transformBox: 'view-box' }}
              >
                <circle cx={stop.x} cy={stop.y} r={STOP_RADIUS} fill={track.color} />
                <circle cx={stop.x} cy={stop.y} r={2.6} fill="var(--bg)" />
                <text {...labelProps(stop)} fill="currentColor" fontSize={11} fontWeight={600}>
                  {stop.label}
                </text>
              </motion.g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
