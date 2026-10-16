import { BarChart3 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { WeeklySummaryPayload } from '@linguo/shared';
import { buttonClasses } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { useWeeklySummary } from '@/features/notifications/useWeeklySummary';
import { cn } from '@/lib/cn';
import { SKILL_LABELS } from '../diagnostic/labels';

function skillLabel(skill: string): string {
  return (SKILL_LABELS as Record<string, string>)[skill] ?? skill;
}

function minutesText(summary: WeeklySummaryPayload): string {
  if (summary.planned_minutes <= 0) return `${summary.minutes} phút học`;
  return `${summary.minutes} / ${summary.planned_minutes} phút theo kế hoạch`;
}

/** One stat: the full sentence for screen readers, a big number + small unit on screen. */
function Stat({ label, text, value, unit, children, className }: { label: string; text: string; value: ReactNode; unit: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl bg-text/[0.04] p-3 ring-1 ring-border ring-inset', className)}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-2">
        <span className="sr-only">{text}</span>
        <span aria-hidden="true" className="flex items-baseline gap-1">
          <span className="stat-num text-[40px]">{value}</span>
          <span className="text-[13px] font-semibold text-muted">{unit}</span>
        </span>
        {children}
      </dd>
    </div>
  );
}

/** Home "Báo cáo tuần": the newest unread weekly_summary of the last 7 days (spec 10 §5). "Đã xem" marks it read. */
export function WeeklySummaryCard() {
  const { status, value, dismiss, markClicked } = useWeeklySummary();
  if (status !== 'ready' || !value) return null;
  const { notification, summary } = value;
  // The notification title is usually "Báo cáo tuần của bạn": skip it when it only repeats the card heading.
  const subtitle = /^báo cáo tuần/i.test(notification.title_vi.trim()) ? null : notification.title_vi;
  const ratio = summary.planned_minutes > 0 ? Math.min(1, summary.minutes / summary.planned_minutes) : null;
  const daysText = summary.planned_days > 0 ? `${summary.active_days} / ${summary.planned_days} ngày` : `${summary.active_days} ngày`;

  return (
    <SolidCard>
      <section aria-labelledby="weekly-summary-title" className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <BarChart3 aria-hidden className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="weekly-summary-title" className="text-[17px] font-bold tracking-[-0.02em]">
              Báo cáo tuần
            </h2>
            {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2.5">
          <Stat
            label="Thời gian học"
            text={minutesText(summary)}
            value={summary.minutes}
            unit={summary.planned_minutes > 0 ? `/${summary.planned_minutes} phút` : 'phút'}
          >
            {ratio !== null && (
              <span aria-hidden="true" className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-text/10">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(ratio * 100)}%` }} />
              </span>
            )}
          </Stat>
          <Stat
            label="Ngày đã học"
            text={daysText}
            value={summary.active_days}
            unit={summary.planned_days > 0 ? `/${summary.planned_days} ngày` : 'ngày'}
          >
            {summary.planned_days > 0 && (
              <span aria-hidden="true" className="mt-2.5 flex gap-1">
                {Array.from({ length: summary.planned_days }, (_, i) => (
                  <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < summary.active_days ? 'bg-accent' : 'bg-text/10')} />
                ))}
              </span>
            )}
          </Stat>
          {summary.weak_skill && (
            <div className="col-span-2 flex items-center justify-between gap-3 rounded-2xl bg-warn/10 px-3 py-2.5 ring-1 ring-warn/25 ring-inset">
              <dt className="eyebrow">Nên luyện thêm</dt>
              <dd className="text-right font-bold">
                {skillLabel(summary.weak_skill)}
                {summary.weak_accuracy !== null && (
                  <span className="font-semibold text-muted"> · đúng {Math.round(summary.weak_accuracy * 100)}%</span>
                )}
              </dd>
            </div>
          )}
        </dl>

        {summary.suggestion_vi && (
          <p className="text-[15px] leading-snug">
            <span className="font-semibold">Gợi ý tuần tới: </span>
            {summary.suggestion_vi}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Link to={notification.action_url} onClick={() => void markClicked()} className={buttonClasses('ghost', 'md')}>
            Xem tiến độ
          </Link>
          <button type="button" onClick={() => void dismiss()} className={buttonClasses('ghost', 'md')}>
            Đã xem
          </button>
        </div>
      </section>
    </SolidCard>
  );
}
