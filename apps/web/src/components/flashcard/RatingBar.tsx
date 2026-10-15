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
      <p id={labelId} className="mb-2 text-sm font-medium text-muted">
        {revealed ? 'Bạn nhớ thẻ này thế nào?' : 'Lật thẻ để chấm'}
      </p>
      <div className="grid grid-cols-4 gap-2">
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
                'flex min-h-14 min-w-0 flex-col items-center justify-center rounded-2xl px-1 py-2 text-center leading-tight',
                'transition-[scale,background-color] duration-200 not-disabled:active:scale-[0.97]',
                DISABLED_NEUTRAL,
                rating === 3
                  ? 'bg-primary text-on-primary not-disabled:hover:bg-primary-strong'
                  : 'border border-input-border bg-surface-solid text-text not-disabled:hover:bg-text/5',
                rating === 1 && 'border-error/60',
              )}
            >
              <span className="text-[16px] font-semibold">{RATING_LABELS[rating]}</span>
              <span className="text-[13px] font-medium">{interval}</span>
              <span aria-hidden="true" className="hidden text-[11px] font-medium sm:block">
                Phím {rating}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
