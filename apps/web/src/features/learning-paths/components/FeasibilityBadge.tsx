import { AlertTriangle, CalendarDays, CheckCircle2, Clock } from 'lucide-react';
import type { Feasibility } from '@linguo/shared';
import { cn } from '@/lib/cn';

const CONFIG: Record<Feasibility, { label: string; icon: typeof Clock; className: string }> = {
  no_deadline: { label: 'Không đặt hạn', icon: CalendarDays, className: 'bg-text/8 text-text' },
  feasible: { label: 'Khả thi theo kế hoạch', icon: CheckCircle2, className: 'bg-success/12 text-success' },
  tight: { label: 'Thời hạn khá căng', icon: AlertTriangle, className: 'bg-warn/15 text-text' },
  needs_more_time: { label: 'Cần tăng thời lượng', icon: Clock, className: 'bg-error/10 text-error' },
};

export function FeasibilityBadge({ feasibility }: { feasibility: Feasibility }) {
  const { label, icon: Icon, className } = CONFIG[feasibility];
  return (
    <span className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold', className)}>
      <Icon aria-hidden className="size-4 shrink-0" />
      {label}
    </span>
  );
}
