import { FileWarning } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SIMULATED_LABEL } from './labels';

/** "Bài luyện mô phỏng — không phải đề thi chính thức" on every form card and result page. */
export function SimulatedBadge({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <p
      className={cn(
        'inline-flex max-w-full items-start gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset',
        onDark ? 'bg-white/10 text-white/90 ring-white/20' : 'bg-primary/10 text-text ring-primary/30',
        className,
      )}
    >
      <FileWarning aria-hidden className={cn('mt-px size-3.5 shrink-0', onDark ? 'text-white/80' : 'text-primary')} />
      <span className="min-w-0">{SIMULATED_LABEL}</span>
    </p>
  );
}
