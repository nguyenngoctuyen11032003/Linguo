import { useEffect, useId } from 'react';
import type { Rating, ReviewCard } from '@linguo/shared';
import { cn } from '@/lib/cn';
import { formatInterval } from './formatInterval';
import { RATING_LABELS, RATING_PREVIEW_KEY, RATINGS } from './ratings';
import { DISABLED_NEUTRAL } from '@/components/ui/disabled-styles';

export interface RatingBarProps {
  previews: ReviewCard['previews'];
  onRate: (rating: Rating) => void;
  /** False until the card is flipped: buttons are disabled and keys 1–4 are ignored. */
  revealed: boolean;
  /** True while a grade is in flight; blocks double submits. */
  submitting?: boolean;
  className?: string;
}

/** Each grade gets its own tint and ledge; the word, interval and key still carry the meaning without colour. */
const TONES: Record<Rating, string> = {
  1: 'border-error/55 bg-error/10 text-error-text shadow-[0_4px_0_var(--error)] not-disabled:hover:bg-error/15 not-disabled:active:shadow-[0_1px_0_var(--error)]',
  2: 'border-warn/60 bg-warn/12 text-gold shadow-[0_4px_0_var(--warn)] not-disabled:hover:bg-warn/18 not-disabled:active:shadow-[0_1px_0_var(--warn)]',
  3: 'border-success/55 bg-success/12 text-success-text shadow-[0_4px_0_var(--success)] not-disabled:hover:bg-success/18 not-disabled:active:shadow-[0_1px_0_var(--success)]',
  4: 'border-primary/55 bg-primary/10 text-primary shadow-[0_4px_0_var(--primary)] not-disabled:hover:bg-primary/15 not-disabled:active:shadow-[0_1px_0_var(--primary)]',
};

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest('input, textarea, select') !== null;
}

/**
 * The four FSRS grades with the interval each one would schedule. Every button carries its word, interval and
 * key number, so the meaning never relies on colour alone.
 */
export function RatingBar({ previews, onRate, revealed, submitting = false, className }: RatingBarProps) {
  const labelId = useId();
  const active = revealed && !submitting;

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      if (isTextEntry(event.target)) return;
      const rating = Number(event.key);
      if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4) return;
      event.preventDefault();
      onRate(rating);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onRate]);

  return (
    <div role="group" aria-labelledby={labelId} aria-busy={submitting || undefined} className={cn('min-w-0', className)}>
      <p id={labelId} className="mb-2.5 text-center text-[13px] font-semibold text-muted">
        {revealed ? 'Bạn nhớ thẻ này thế nào?' : 'Lật thẻ để chấm'}
      </p>
      <div className="grid grid-cols-4 gap-2 pb-1">
        {RATINGS.map((rating) => {
          const interval = formatInterval(previews[RATING_PREVIEW_KEY[rating]].interval_minutes);
          return (
            <button
              key={rating}
              type="button"
              disabled={!active}
              onClick={() => onRate(rating)}
              aria-keyshortcuts={String(rating)}
              aria-label={`${RATING_LABELS[rating]}, ôn lại sau ${interval}`}
              data-rating={rating}
              className={cn(
                'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[1.25rem] border-2 px-1 pb-2.5 pt-2 text-center leading-tight',
                'transition-[translate,box-shadow,background-color] duration-150 not-disabled:active:translate-y-[3px] disabled:shadow-none',
                DISABLED_NEUTRAL,
                TONES[rating],
              )}
            >
              <span className="text-[15px] font-extrabold">{RATING_LABELS[rating]}</span>
              <span className="stat-num text-[22px] text-text">{interval}</span>
              <span aria-hidden="true" className="hidden text-xs font-semibold opacity-80 sm:block">
                Phím {rating}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
