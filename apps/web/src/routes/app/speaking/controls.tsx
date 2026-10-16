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
      <p id={labelId} className="eyebrow px-1">
        {label}
      </p>
      <div role="group" aria-labelledby={labelId} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.id === value}
            onClick={() => onChange(o.id)}
            className={cn(
              'min-h-12 min-w-0 rounded-[1.25rem] border-2 px-2 py-1.5 text-center text-[13px] leading-tight font-bold text-balance transition-[translate,box-shadow,background-color] active:translate-y-[2px] max-[379px]:px-1 min-[380px]:text-[15px]',
              FOCUS_RING,
              o.id === value ? 'border-primary bg-primary/12 text-primary shadow-[0_3px_0_var(--primary-depth)] active:shadow-[0_1px_0_var(--primary-depth)]' : 'border-border bg-surface-solid shadow-[0_3px_0_var(--border)] hover:bg-text/5 active:shadow-[0_1px_0_var(--border)]',
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
      <label htmlFor={id} className="eyebrow block px-1">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('min-h-12 w-full rounded-full border border-input-border bg-surface-solid px-4 text-[15px] font-semibold text-text', FOCUS_RING)}
      >
        {children}
      </select>
    </div>
  );
}
