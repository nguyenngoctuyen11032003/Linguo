import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Use behind long text: glass is for chrome and short labels only. */
export function SolidCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-3xl border border-border bg-surface-solid p-5 shadow-[var(--shadow-card)]', className)} {...rest} />
  );
}
