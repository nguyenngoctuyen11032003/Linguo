import { forwardRef, useId } from 'react';
import type { Confidence } from '@/features/lesson-player/types';
import { cn } from '@/lib/cn';
import { CONFIDENCE_LABELS } from './exercise-utils';
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
      <p id={labelId} className="mb-2 text-sm font-medium text-muted">
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
              'inline-flex min-h-12 min-w-0 items-center justify-center rounded-full px-2 text-center text-[15px] font-semibold leading-tight',
              'transition-[scale,background-color] duration-200 not-disabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60',
              level === 3
                ? 'bg-primary text-on-primary not-disabled:hover:bg-primary-strong'
                : 'border border-border bg-surface-solid text-text not-disabled:hover:bg-text/5',
            )}
          >
            {CONFIDENCE_LABELS[level]}
          </button>
        ))}
      </div>
    </div>
  );
});
