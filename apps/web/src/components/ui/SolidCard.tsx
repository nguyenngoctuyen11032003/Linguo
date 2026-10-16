import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** A `p-*` in className replaces the default padding (cn only joins classes, it does not resolve conflicts). */
const HAS_PADDING = /(^|\s)([\w-]+:)*p-/;

/** Use behind long text: glass is for chrome and short labels only. */
export function SolidCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', !HAS_PADDING.test(className ?? '') && 'p-5', className)} {...rest} />;
}
