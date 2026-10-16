import { useId } from 'react';
import { m as motion } from 'motion/react';
import type { ActivityDay } from '@linguo/shared';
import { EASE_OUT } from '@/design/motion';
import { formatMinutes } from '@/features/learning-paths/components/schedule';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { dayMonth, weekdayShort } from './labels';

// SVG user units: each day gets a SLOT wide column; bars are drawn inside it with padding.
const SLOT = 20;
const BAR = 12;
const HEIGHT = 100;
/** Headroom above the tallest value so goal ticks are never clipped. */
const HEADROOM = 1.15;

const isRest = (d: ActivityDay) => d.goal_minutes === 0;
const metGoal = (d: ActivityDay) => !isRest(d) && d.minutes >= d.goal_minutes;

function summary(days: ActivityDay[]): string {
  const total = days.reduce((sum, d) => sum + d.minutes, 0);
  const scheduled = days.filter((d) => !isRest(d));
  const met = scheduled.filter(metGoal).length;
  const today = days.at(-1)?.minutes ?? 0;
  const goalPart = scheduled.length > 0 ? `đạt mục tiêu ${met} trên ${scheduled.length} ngày theo lịch` : 'không có ngày học theo lịch';
  return `Biểu đồ phút học mỗi ngày trong ${days.length} ngày qua: tổng ${formatMinutes(total)}; ${goalPart}; hôm nay ${formatMinutes(today)}.`;
}

function note(day: ActivityDay, isToday: boolean): string {
  const parts: string[] = [];
  if (isToday) parts.push('Hôm nay');
  if (isRest(day)) parts.push('Ngày nghỉ theo lịch');
  else if (metGoal(day)) parts.push('Đạt mục tiêu');
  return parts.join(', ');
}

/** Which columns get an axis label: all of them up to 14 days, else one per week counted back from today. */
function showLabel(index: number, count: number): boolean {
  return count <= 14 || (count - 1 - index) % 7 === 0;
}

/**
 * Minutes per day against the day's planned minutes (goal tick). Rest days (goal 0) get a hatched column and a
 * "nghỉ" label; today is drawn in the accent colour and labelled "Nay". Screen readers get the summary label
 * and a hidden table with every day.
 */
export function ActivityChart({ days }: { days: ActivityDay[] }) {
  const { reduceMotion } = useMotionPrefs();
  const patternId = `rest-hatch-${useId().replace(/:/g, '')}`;
  const count = days.length;
  const max = Math.max(1, ...days.map((d) => Math.max(d.minutes, d.goal_minutes))) * HEADROOM;
  const scale = (minutes: number) => (minutes / max) * HEIGHT;
  const width = Math.max(1, count) * SLOT;

  return (
    <figure className="m-0 min-w-0">
      <svg
        role="img"
        aria-label={summary(days)}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="block h-40 w-full overflow-visible"
      >
        <defs>
          <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="2" />
          </pattern>
        </defs>
        <line x1="0" y1={HEIGHT} x2={width} y2={HEIGHT} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {days.map((day, i) => {
          const isToday = i === count - 1;
          const rest = isRest(day);
          const x = i * SLOT + (SLOT - BAR) / 2;
          const h = day.minutes > 0 ? Math.max(2, scale(day.minutes)) : 0;
          return (
            <g key={day.date} data-day={day.date} data-rest={rest} data-today={isToday}>
              {rest && <rect x={x} y={0} width={BAR} height={HEIGHT} fill={`url(#${patternId})`} className="text-text/10" />}
              {h > 0 && (
                <motion.rect
                  x={x}
                  y={HEIGHT - h}
                  width={BAR}
                  height={h}
                  rx={4}
                  className={cn(isToday ? 'fill-accent' : rest ? 'fill-primary/45' : 'fill-primary')}
                  style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                  initial={reduceMotion ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.4, ease: EASE_OUT, delay: reduceMotion ? 0 : i * 0.02 }}
                />
              )}
              {!rest && (
                <line
                  data-goal-tick
                  x1={x - 2}
                  x2={x + BAR + 2}
                  y1={HEIGHT - scale(day.goal_minutes)}
                  y2={HEIGHT - scale(day.goal_minutes)}
                  className="stroke-text/70"
                  strokeWidth="2"
                  strokeDasharray="3 2"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}
      </svg>

      <div
        data-testid="activity-axis"
        aria-hidden="true"
        className="mt-1.5 grid text-xs leading-tight text-muted"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, count)}, minmax(0, 1fr))` }}
      >
        {days.map((day, i) => {
          const isToday = i === count - 1;
          if (!isToday && !showLabel(i, count)) return <span key={day.date} />;
          const text = isToday ? 'Nay' : count <= 14 ? weekdayShort(day.date) : dayMonth(day.date);
          return (
            <span
              key={day.date}
              className={cn(
                'flex flex-col items-center whitespace-nowrap',
                isToday && 'font-semibold text-text',
                i === 0 && count > 14 && 'items-start',
                isToday && count > 14 && 'items-end',
              )}
            >
              <span>{text}</span>
              {count <= 7 && isRest(day) && <span>nghỉ</span>}
            </span>
          );
        })}
      </div>

      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-primary" />
          Phút đã học
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-accent" />
          Hôm nay
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-3 border-t-2 border-dashed border-text/70" />
          Mục tiêu theo lịch
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-sm"
            style={{ backgroundImage: 'repeating-linear-gradient(45deg, var(--muted) 0 1.5px, transparent 1.5px 4px)' }}
          />
          Ngày nghỉ theo lịch
        </span>
      </figcaption>

      <div className="sr-only">
        <table>
          <caption>Phút học theo ngày</caption>
          <thead>
            <tr>
              <th scope="col">Ngày</th>
              <th scope="col">Phút học</th>
              <th scope="col">Mục tiêu</th>
              <th scope="col">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, i) => (
              <tr key={day.date}>
                <th scope="row">
                  {weekdayShort(day.date)} {dayMonth(day.date)}
                </th>
                <td>{formatMinutes(day.minutes)}</td>
                <td>{isRest(day) ? 'Không có' : formatMinutes(day.goal_minutes)}</td>
                <td>{note(day, i === count - 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
