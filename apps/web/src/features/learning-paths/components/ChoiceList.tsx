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
  /** Optional id of an element (e.g. a validation message) that describes the whole group. */
  describedBy?: string;
  columns?: 1 | 2;
}

/** Native radio group styled as tappable cards: arrow keys work, labels are the accessible names. */
export function ChoiceList<T extends string>({ name, options, value, onChange, labelledBy, describedBy, columns = 1 }: ChoiceListProps<T>) {
  return (
    <fieldset aria-labelledby={labelledBy} aria-describedby={describedBy} className={cn('grid min-w-0 gap-3 pb-1', columns === 2 && 'sm:grid-cols-2')}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'flex min-h-16 items-start gap-3.5 rounded-[1.25rem] border-2 border-border bg-surface-solid px-4 py-3.5 shadow-[0_4px_0_var(--border)]',
            'transition-[translate,box-shadow,background-color,border-color] duration-150',
            'has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:shadow-[0_4px_0_var(--primary)] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/40',
            option.disabled
              ? 'cursor-not-allowed border-dashed shadow-none'
              : 'cursor-pointer hover:bg-text/[0.03] active:translate-y-[3px] active:shadow-[0_1px_0_var(--border)] has-[:checked]:active:shadow-[0_1px_0_var(--primary)]',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            className="mt-0.5 size-6 shrink-0 cursor-[inherit] appearance-none rounded-full border-2 border-input-border bg-surface-solid transition-[background-color,border-color,box-shadow] duration-150 checked:border-primary checked:bg-primary checked:shadow-[inset_0_0_0_4px_var(--surface-solid)] focus-visible:outline-none"
          />
          <span className="min-w-0 flex-1">
            <span className={cn('block text-[17px] font-bold leading-snug', option.disabled && 'opacity-60')}>{option.label}</span>
            {option.description && (
              <span className={cn('mt-1 block text-sm leading-snug text-muted', option.disabled && 'opacity-60')}>{option.description}</span>
            )}
            {option.note && (
              <span className="mt-2 inline-block rounded-full bg-text/[0.06] px-2.5 py-0.5 text-xs font-semibold text-muted">{option.note}</span>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
