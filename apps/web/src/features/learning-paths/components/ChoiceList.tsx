import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  note?: ReactNode;
}

interface ChoiceListProps<T extends string> {
  name: string;
  options: readonly Choice<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  labelledBy: string;
  columns?: 1 | 2;
}

/** Native radio group styled as tappable cards: arrow keys work, labels are the accessible names. */
export function ChoiceList<T extends string>({ name, options, value, onChange, labelledBy, columns = 1 }: ChoiceListProps<T>) {
  return (
    <fieldset aria-labelledby={labelledBy} className={cn('grid gap-2', columns === 2 && 'sm:grid-cols-2')}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'flex min-h-14 items-start gap-3 rounded-2xl border border-border bg-surface-solid px-4 py-3 transition-colors',
            'has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/40',
            option.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-text/5',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{option.label}</span>
            {option.description && <span className="mt-0.5 block text-sm text-muted">{option.description}</span>}
            {option.note && <span className="mt-1 block text-xs font-medium text-muted">{option.note}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
