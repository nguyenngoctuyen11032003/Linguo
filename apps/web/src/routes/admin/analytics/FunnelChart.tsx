import type { AdminAnalytics } from '@linguo/shared';
import { formatCount, formatShare, funnelRows } from '@/features/admin/analytics';

/**
 * Onboarding → first lesson → third lesson → day-7 return funnel. Every number is text in the list; the bars are
 * a decorative SVG drawn to scale of the first step.
 */
export function FunnelChart({ funnel }: { funnel: AdminAnalytics['funnel'] }) {
  const rows = funnelRows(funnel);
  return (
    <ol aria-label="Phễu người dùng" className="space-y-3">
      {rows.map((row, i) => {
        const width = row.ofStart === null ? 0 : Math.max(row.count > 0 ? 1 : 0, row.ofStart * 100);
        return (
          <li key={row.key} data-step={row.key} className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15px]">
              <span className="font-semibold">{row.label}</span>
              <span className="tabular-nums">
                <strong>{formatCount(row.count)}</strong>
                <span className="text-muted">
                  {' '}
                  · {formatShare(row.ofStart)} so với đăng ký
                  {i > 0 && ` · ${formatShare(row.ofPrevious)} so với bước trước`}
                </span>
              </span>
            </div>
            <svg aria-hidden="true" viewBox="0 0 100 6" preserveAspectRatio="none" className="block h-3 w-full">
              <rect x="0" y="0" width="100" height="6" rx="3" className="fill-text/10" />
              {width > 0 && <rect x="0" y="0" width={width} height="6" rx="3" className="fill-primary" />}
            </svg>
          </li>
        );
      })}
    </ol>
  );
}
