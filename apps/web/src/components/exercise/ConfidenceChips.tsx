import { forwardRef, useId } from 'react';
import type { Confidence } from '@/features/lesson-player/types';
import { cn } from '@/lib/cn';
import { CONFIDENCE_LABELS } from './exercise-utils';
import { DISABLED_NEUTRAL } from '@/components/ui/disabled-styles';
const LEVELS: Confidence[] = [1, 2, 3];

export interface ConfidenceChipsProps {
  onPick: (confidence: Confidence) => void;
  disabled?: boolean;
}

/** Recall/application stages: picking a confidence level also submits the answer. The ref targets the first chip. */
export const ConfidenceChips = forwardRef<HTMLButtonElement, ConfidenceChipsProps>(function ConfidenceChips({ onPick, disabled = false }, ref) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="min-w-0">
      <p id={labelId} className="mb-2.5 text-center text-[13px] font-semibold text-muted">
        Bạn chắc đến đâu? Chọn để nộp bài
      </p>
      <div className="grid grid-cols-3 gap-2">
        {LEVELS.map((level) => (
          <button
            key={level}
            ref={level === 1 ? ref : undefined}
            type="button"
            disabled={disabled}
            onClick={() => onPick(level)}
            className={cn(
              'inline-flex min-h-13 min-w-0 items-center justify-center rounded-2xl px-2 text-center text-[15px] font-bold leading-tight',
              'transition-[translate,box-shadow,background-color] duration-150 not-disabled:active:translate-y-[3px] disabled:cursor-not-allowed disabled:shadow-none',
              DISABLED_NEUTRAL,
              // All three levels look the same: no option is visually the "right" one to pick.
              'border-2 border-input-border bg-surface-solid text-text shadow-[0_4px_0_var(--input-border)] not-disabled:hover:bg-text/[0.03] not-disabled:active:shadow-[0_1px_0_var(--input-border)]',
            )}
          >
            {CONFIDENCE_LABELS[level]}
          </button>
        ))}
      </div>
    </div>
  );
});
