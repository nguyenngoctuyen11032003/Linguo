import { forwardRef, useId } from 'react';
import type { Confidence } from '@/features/lesson-player/types';
import { cn } from '@/lib/cn';
import { CONFIDENCE_LABELS } from './exercise-utils';
import { DISABLED_NEUTRAL } from '@/components/ui/disabled-styles';
const LEVELS: Confidence[] = [1, 2, 3];
const BAR_HEIGHT: Record<Confidence, string> = { 1: 'h-1.5', 2: 'h-2.5', 3: 'h-3.5' };

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
              'group inline-flex min-h-15 min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2 text-center text-[14px] font-bold leading-tight whitespace-nowrap min-[360px]:text-[15px]',
              'transition-[translate,box-shadow,background-color] duration-150 not-disabled:active:translate-y-[3px] disabled:cursor-not-allowed disabled:shadow-none',
              DISABLED_NEUTRAL,
              // All three levels look the same: no option is visually the "right" one to pick.
              'border-2 border-input-border bg-surface-solid text-text shadow-[0_4px_0_var(--input-border)] not-disabled:hover:bg-text/[0.03] not-disabled:active:shadow-[0_1px_0_var(--input-border)]',
            )}
          >
            {/* A tiny 1–3 bar meter: the level reads at a glance without changing the chips' equal weight. */}
            <span aria-hidden="true" className="flex h-3.5 items-end gap-[3px] text-primary group-disabled:text-muted">
              {LEVELS.map((bar) => (
                <span key={bar} className={cn('w-1 rounded-full bg-current', BAR_HEIGHT[bar], bar > level && 'opacity-25')} />
              ))}
            </span>
            {CONFIDENCE_LABELS[level]}
          </button>
        ))}
      </div>
    </div>
  );
});
