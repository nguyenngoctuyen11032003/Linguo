import { useId } from 'react';
import { CONFIDENCE_LABELS } from '@/components/exercise';
import type { Confidence } from '@/features/reviews/types';
import { cn } from '@/lib/cn';
import { playSound } from '@/lib/sound';

const LEVELS: Confidence[] = [1, 2, 3];
const BAR_HEIGHT: Record<Confidence, string> = { 1: 'h-1.5', 2: 'h-2.5', 3: 'h-3.5' };

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
      <p id={labelId} className="mb-2.5 text-center text-[13px] font-semibold text-muted">
        Bạn nhớ chắc đến đâu? (không bắt buộc)
      </p>
      <div className="grid grid-cols-3 gap-2 pb-1">
        {LEVELS.map((level) => {
          const pressed = value === level;
          return (
            <button
              key={level}
              type="button"
              aria-pressed={pressed}
              onClick={() => {
                playSound('select');
                onChange(pressed ? null : level);
              }}
              className={cn(
                'group inline-flex min-h-14 min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-1 py-2 text-center text-[14px] font-bold leading-tight whitespace-nowrap min-[360px]:text-[15px]',
                'transition-[translate,box-shadow,background-color] duration-150 active:translate-y-[3px]',
                pressed
                  ? 'border-primary bg-primary/12 text-text shadow-[0_4px_0_var(--primary)] active:shadow-[0_1px_0_var(--primary)]'
                  : 'border-border bg-surface-solid text-text shadow-[0_4px_0_var(--border)] hover:bg-text/5 active:shadow-[0_1px_0_var(--border)]',
              )}
            >
              <span aria-hidden="true" className={cn('flex h-3.5 items-end gap-[3px]', pressed ? 'text-primary' : 'text-muted')}>
                {LEVELS.map((bar) => (
                  <span key={bar} className={cn('w-1 rounded-full bg-current', BAR_HEIGHT[bar], bar > level && 'opacity-30')} />
                ))}
              </span>
              {CONFIDENCE_LABELS[level]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
