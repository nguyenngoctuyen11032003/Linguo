import { Sparkles } from 'lucide-react';
import type { AiQuota } from '@/features/ai-tutor/quota';
import { formatResetTime } from '@/features/ai-tutor/error-map';
import { cn } from '@/lib/cn';

export interface AiQuotaChipProps {
  /** Today's quota (`useAiQuota().quota` or the latest answer's `quota`); nothing renders while null. */
  quota: AiQuota | null | undefined;
  className?: string;
}

/** "Còn 17/20 lượt" — today's remaining AI requests. */
export function AiQuotaChip({ quota, className }: AiQuotaChipProps) {
  if (!quota || quota.limit <= 0) return null;
  const left = Math.max(0, quota.limit - quota.used);
  const reset = formatResetTime(quota.resets_at);
  return (
    <span
      title={reset ? `Lượt mới lúc ${reset}` : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[13px] font-semibold ring-1 ring-inset',
        left === 0 ? 'bg-error/12 text-error-text ring-error/30' : 'bg-primary/10 text-primary-strong ring-primary/25 dark:text-primary',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-full',
          left === 0 ? 'bg-error text-white' : 'bg-gradient-to-br from-primary to-primary-strong text-on-primary',
        )}
      >
        <Sparkles className="size-3.5" />
      </span>
      <span className="tabular-nums">
        Còn {left}/{quota.limit} lượt
        {left === 0 && reset && <span className="sr-only"> · lượt mới lúc {reset}</span>}
      </span>
    </span>
  );
}
