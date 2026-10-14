import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40';

/** A pill that is "on" or "off" (aria-pressed), 44 px tall for touch. */
export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const labelId = useId();
  return (
    <div className="space-y-1.5">
      <p id={labelId} className="px-1 text-sm font-medium">
        {label}
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.id === value}
            onClick={() => onChange(o.id)}
            className={cn(
              'min-h-11 rounded-full border px-4 text-[15px] font-semibold transition-colors',
              FOCUS_RING,
              o.id === value ? 'border-primary bg-primary/12 text-primary' : 'border-border hover:bg-text/5',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block px-1 text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('min-h-11 w-full rounded-2xl border border-border bg-surface-solid px-3 text-[15px] text-text', FOCUS_RING)}
      >
        {children}
      </select>
    </div>
  );
}
