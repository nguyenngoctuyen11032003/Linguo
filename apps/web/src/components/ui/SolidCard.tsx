import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Use behind long text: glass is for chrome and short labels only. */
export function SolidCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card p-5', className)} {...rest} />;
}
