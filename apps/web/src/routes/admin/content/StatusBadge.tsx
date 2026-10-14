import { statusLabel } from '@/features/admin/content';
import { cn } from '@/lib/cn';

const TONES: Record<string, string> = {
  draft: 'border-border text-muted',
  in_review: 'border-warn/60 bg-warn/15 text-text',
  approved: 'border-primary/50 bg-primary/10 text-text',
  published: 'border-success/50 bg-success/10 text-success-text',
  archived: 'border-border bg-text/5 text-muted',
};

/** Content status pill, plus a "Demo" pill for demo rows. */
export function StatusBadge({ status, isDemo = false }: { status: string; isDemo?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap', TONES[status] ?? TONES.draft)}>
        {statusLabel(status)}
      </span>
      {isDemo && <span className="inline-flex rounded-full border border-gold/60 px-2 py-0.5 text-xs font-semibold text-text">Demo</span>}
    </span>
  );
}
