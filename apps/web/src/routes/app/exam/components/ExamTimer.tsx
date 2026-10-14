import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock, Infinity as InfinityIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ExamTimerProps {
  /** Time left from the server deadline; null = untimed practice. */
  remainingMs: number | null;
}

const WARN_MS = 5 * 60_000;
/** Announced once each when the countdown crosses them, never every second. */
const MILESTONES = [
  { ms: WARN_MS, text: 'Còn 5 phút' },
  { ms: 60_000, text: 'Còn 1 phút' },
] as const;

/** "mm:ss"; minutes may exceed 59 (a 65-minute section reads "65:00"). */
function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Countdown for the runner header. Screen readers hear only the 5-minute and 1-minute milestones. */
export function ExamTimer({ remainingMs }: ExamTimerProps) {
  const previous = useRef<number | null>(remainingMs);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const before = previous.current;
    previous.current = remainingMs;
    if (before === null || remainingMs === null) return;
    // Latest milestone crossed between the two readings (a long throttle can skip past both).
    const crossed = MILESTONES.filter((m) => before > m.ms && remainingMs <= m.ms).at(-1);
    if (crossed) setAnnouncement(crossed.text);
  }, [remainingMs]);

  if (remainingMs === null) {
    return (
      // Icon-only below `sm`: the long label would squeeze the title and position out of the header.
      <p className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted">
        <InfinityIcon aria-hidden className="size-5 sm:size-4" />
        <span className="sr-only sm:not-sr-only">Không giới hạn thời gian</span>
      </p>
    );
  }

  const warning = remainingMs <= WARN_MS;
  return (
    <div className="inline-flex shrink-0 items-center gap-2">
      <span
        role="timer"
        aria-live="off"
        aria-label={`Thời gian còn lại ${formatClock(remainingMs)}`}
        data-warning={warning || undefined}
        className={cn(
          'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 font-mono min-[380px]:px-3 text-[15px] font-bold tabular-nums',
          warning ? 'border-error/60 bg-error/10 text-error-text' : 'border-border bg-surface-solid text-text',
        )}
      >
        {warning ? <AlertTriangle aria-hidden className="size-4" /> : <Clock aria-hidden className="size-4" />}
        {formatClock(remainingMs)}
      </span>
      {warning && <span className="sr-only sm:not-sr-only sm:text-sm sm:font-medium sm:text-error-text">Sắp hết giờ</span>}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
