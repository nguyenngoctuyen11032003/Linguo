import { cn } from '@/lib/cn';

/** Placeholder block with a soft highlight sweep (feedback.css `.lg-skel`; static under reduced motion). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('lg-skel relative inline-block overflow-hidden rounded-xl bg-text/[0.07]', className)} />;
}
