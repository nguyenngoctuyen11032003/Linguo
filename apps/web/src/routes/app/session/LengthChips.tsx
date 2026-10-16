import { useId } from 'react';
import { SESSION_LENGTHS, type SessionLength } from '@linguo/shared';
import { cn } from '@/lib/cn';
import { DISABLED_NEUTRAL } from '@/components/ui/disabled-styles';

interface Props {
  value: SessionLength;
  onChange: (value: SessionLength) => void;
  disabled?: boolean;
}

/** "Bạn có bao nhiêu phút?" — one chip per allowed session length (10..120). */
export function LengthChips({ value, onChange, disabled }: Props) {
  const labelId = useId();
  return (
    <div className="space-y-2">
      <p id={labelId} className="eyebrow">
        Bạn có bao nhiêu phút?
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2 pb-1">
        {SESSION_LENGTHS.map((length) => (
          <button
            key={length}
            type="button"
            aria-pressed={length === value}
            disabled={disabled}
            onClick={() => onChange(length)}
            className={cn(
              'min-h-11 min-w-11 rounded-2xl border-2 px-4 text-[15px] font-bold tabular-nums transition-[translate,box-shadow,background-color] duration-150 not-disabled:active:translate-y-[2px]',
              DISABLED_NEUTRAL,
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
              length === value
                ? 'border-primary bg-primary/12 text-primary shadow-[0_3px_0_var(--primary)]'
                : 'border-border bg-surface-solid shadow-[0_3px_0_var(--border)] hover:bg-text/5',
            )}
          >
            {length} phút
          </button>
        ))}
      </div>
    </div>
  );
}
