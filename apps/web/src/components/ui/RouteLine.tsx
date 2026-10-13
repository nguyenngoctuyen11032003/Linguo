import { useId, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { EXPO_OUT, SPRING_POP, VIEWPORT_ONCE } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';

export interface RouteStop {
  x: number;
  y: number;
  label: string;
  labelPosition?: 'top' | 'bottom' | 'left' | 'right';
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

function labelProps(stop: RouteStop) {
  switch (stop.labelPosition ?? 'top') {
    case 'bottom':
      return { x: stop.x, y: stop.y + 22, textAnchor: 'middle' as const };
    case 'left':
      return { x: stop.x - 12, y: stop.y + 4, textAnchor: 'end' as const };
    case 'right':
      return { x: stop.x + 12, y: stop.y + 4, textAnchor: 'start' as const };
    default:
      return { x: stop.x, y: stop.y - 13, textAnchor: 'middle' as const };
  }
}

/** CARGOX-style route map used as the "learning path" metaphor: lines draw in, stops pop, arrows travel. */
export function RouteLine({ title, viewBox, tracks, className }: RouteLineProps) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, VIEWPORT_ONCE);
  const { reduceMotion } = useMotionPrefs();
  const drawn = reduceMotion || inView;
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, '');

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
            />
            {!reduceMotion && drawn && (
              <polygon points="0,-4 8,0 0,4" fill={track.color}>
                <animateMotion dur={`${7 + ti}s`} begin={`${1.6 + ti * 0.25}s`} repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </polygon>
            )}
            {track.stops.map((stop, si) => (
              <motion.g
                key={stop.label}
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0 }}
                animate={drawn ? { opacity: 1, scale: 1 } : { opacity: 0 }}
                transition={{ duration: 0.5, ease: SPRING_POP, delay: reduceMotion ? 0 : 0.4 + ti * 0.25 + si * 0.15 }}
                style={{ transformOrigin: `${stop.x}px ${stop.y}px`, transformBox: 'view-box' }}
              >
                <circle cx={stop.x} cy={stop.y} r={7} fill={track.color} />
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
