import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block animate-pulse rounded-xl bg-text/10', className)} />;
}
