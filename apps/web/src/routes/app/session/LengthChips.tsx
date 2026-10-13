import { useId } from 'react';
import { SESSION_LENGTHS, type SessionLength } from '@linguo/shared';
import { cn } from '@/lib/cn';

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
      <p id={labelId} className="text-sm font-medium">
        Bạn có bao nhiêu phút?
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {SESSION_LENGTHS.map((length) => (
          <button
            key={length}
            type="button"
            aria-pressed={length === value}
            disabled={disabled}
            onClick={() => onChange(length)}
            className={cn(
              'min-h-11 min-w-11 rounded-full border px-4 text-[15px] font-semibold transition-colors disabled:opacity-60',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
              length === value ? 'border-primary bg-primary/12 text-primary' : 'border-border hover:bg-text/5',
            )}
          >
            {length} phút
          </button>
        ))}
      </div>
    </div>
  );
}
