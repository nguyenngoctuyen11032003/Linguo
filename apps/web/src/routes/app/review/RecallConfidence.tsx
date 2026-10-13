import { useId } from 'react';
import { CONFIDENCE_LABELS } from '@/components/exercise';
import type { Confidence } from '@/features/reviews/types';
import { cn } from '@/lib/cn';

const LEVELS: Confidence[] = [1, 2, 3];

interface Props {
  value: Confidence | null;
  onChange: (value: Confidence | null) => void;
}

/**
 * Optional confidence before flipping a recall card. Unlike the exercise ConfidenceChips it does not submit:
 * picking only toggles a level, and the learner can flip without choosing.
 */
export function RecallConfidence({ value, onChange }: Props) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="min-w-0">
      <p id={labelId} className="mb-2 text-sm font-medium text-muted">
        Bạn nhớ chắc đến đâu? (không bắt buộc)
      </p>
      <div className="grid grid-cols-3 gap-2">
        {LEVELS.map((level) => {
          const pressed = value === level;
          return (
            <button
              key={level}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(pressed ? null : level)}
              className={cn(
                'inline-flex min-h-12 min-w-0 items-center justify-center rounded-full px-2 text-center text-[15px] font-semibold leading-tight',
                'transition-[scale,background-color] duration-200 active:scale-[0.97]',
                pressed ? 'bg-primary text-on-primary hover:bg-primary-strong' : 'border border-border bg-surface-solid text-text hover:bg-text/5',
              )}
            >
              {CONFIDENCE_LABELS[level]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
