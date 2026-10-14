import { PROGRESS_RANGES, type ProgressRange } from '@linguo/shared';
import { cn } from '@/lib/cn';

interface RangeToggleProps {
  value: ProgressRange;
  onChange: (range: ProgressRange) => void;
}

/** Segmented 7 / 14 / 28-day picker; the selected range is exposed with aria-pressed. */
export function RangeToggle({ value, onChange }: RangeToggleProps) {
  return (
    <div role="group" aria-label="Khoảng thời gian" className="inline-flex rounded-full border border-border bg-surface-solid p-1">
      {PROGRESS_RANGES.map((range) => {
        const selected = range === value;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (!selected) onChange(range);
            }}
            className={cn(
              'min-h-11 rounded-full px-4 text-[15px] font-semibold transition-colors duration-200',
              selected ? 'bg-primary text-on-primary' : 'text-muted hover:bg-text/5 hover:text-text',
            )}
          >
            {range} ngày
          </button>
        );
      })}
    </div>
  );
}
