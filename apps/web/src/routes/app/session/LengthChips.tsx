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
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-4 gap-2 pb-1 sm:grid-cols-7">
        {SESSION_LENGTHS.map((length) => (
          <button
            key={length}
            type="button"
            aria-pressed={length === value}
            aria-label={`${length} phút`}
            disabled={disabled}
            onClick={() => onChange(length)}
            className={cn(
              'flex min-h-14 min-w-11 flex-col items-center justify-center rounded-2xl border-2 px-1 py-1.5 leading-none transition-[translate,box-shadow,background-color] duration-150 not-disabled:active:translate-y-[2px]',
              DISABLED_NEUTRAL,
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
              length === value
                ? 'border-primary bg-primary/12 text-primary shadow-[0_3px_0_var(--primary)]'
                : 'border-border bg-surface-solid shadow-[0_3px_0_var(--border)] hover:bg-text/5',
            )}
          >
            {/* Equal tiles: the minutes as a numeral, the unit as a small label. */}
            <span aria-hidden="true" className="stat-num text-[24px]">{length}</span>
            <span aria-hidden="true" className="mt-0.5 text-[12px] font-bold">phút</span>
          </button>
        ))}
      </div>
    </div>
  );
}
