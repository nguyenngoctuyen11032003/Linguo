import { CloudOff, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Marks unreviewed demo content (spec 2 §8). */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border border-warn/60 bg-warn/10 px-3 py-1 text-xs font-semibold text-text',
        className,
      )}
    >
      <FlaskConical aria-hidden className="size-3.5 shrink-0 text-gold" />
      <span className="min-w-0">Nội dung demo — chưa kiểm duyệt</span>
    </span>
  );
}

/** Shown while an attempt waits in the offline outbox; no verdict is displayed until the server grades it. */
export function PendingSyncBadge() {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-border bg-surface-solid px-3 py-2 text-sm font-medium text-text">
      <CloudOff aria-hidden className="size-4 shrink-0 text-muted" />
      <span className="min-w-0">Đang chờ đồng bộ — sẽ chấm khi có mạng</span>
    </span>
  );
}
