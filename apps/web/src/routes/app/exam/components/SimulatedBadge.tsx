import { FileWarning } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SIMULATED_LABEL } from './labels';

/** "Bài luyện mô phỏng — không phải đề thi chính thức" on every form card and result page. */
export function SimulatedBadge({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'inline-flex max-w-full items-start gap-1.5 rounded-2xl border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-text',
        className,
      )}
    >
      <FileWarning aria-hidden className="mt-px size-3.5 shrink-0 text-primary" />
      <span className="min-w-0">{SIMULATED_LABEL}</span>
    </p>
  );
}
