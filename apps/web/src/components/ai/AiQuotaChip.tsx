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
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold',
        left === 0 ? 'bg-error/12 text-error-text' : 'bg-primary/12 text-primary-strong dark:text-primary',
        className,
      )}
    >
      <Sparkles aria-hidden className="size-3.5" />
      <span>
        Còn {left}/{quota.limit} lượt
        {left === 0 && reset && <span className="sr-only"> · lượt mới lúc {reset}</span>}
      </span>
    </span>
  );
}
