import { BarChart3 } from 'lucide-react';
import { Link } from 'react-router';
import type { WeeklySummaryPayload } from '@linguo/shared';
import { buttonClasses } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { useWeeklySummary } from '@/features/notifications/useWeeklySummary';
import { SKILL_LABELS } from '../diagnostic/labels';

function skillLabel(skill: string): string {
  return (SKILL_LABELS as Record<string, string>)[skill] ?? skill;
}

function MinutesLine({ summary }: { summary: WeeklySummaryPayload }) {
  if (summary.planned_minutes <= 0) return <>{summary.minutes} phút học</>;
  return (
    <>
      {summary.minutes} / {summary.planned_minutes} phút theo kế hoạch
    </>
  );
}

/** Home "Báo cáo tuần": the newest unread weekly_summary of the last 7 days (spec 10 §5). "Đã xem" marks it read. */
export function WeeklySummaryCard() {
  const { status, value, dismiss, markClicked } = useWeeklySummary();
  if (status !== 'ready' || !value) return null;
  const { notification, summary } = value;
  const ratio = summary.planned_minutes > 0 ? Math.min(1, summary.minutes / summary.planned_minutes) : null;

  return (
    <SolidCard>
      <section aria-labelledby="weekly-summary-title" className="space-y-4">
        <div className="flex items-start gap-4">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <BarChart3 aria-hidden className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="weekly-summary-title" className="text-lg font-bold tracking-[-0.02em]">
              Báo cáo tuần
            </h2>
            <p className="text-sm text-muted">{notification.title_vi}</p>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-text/5 px-4 py-3">
            <dt className="text-sm text-muted">Thời gian học</dt>
            <dd className="font-semibold">
              <MinutesLine summary={summary} />
            </dd>
            {ratio !== null && (
              <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-text/10">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(ratio * 100)}%` }} />
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-text/5 px-4 py-3">
            <dt className="text-sm text-muted">Ngày đã học</dt>
            <dd className="font-semibold">
              {summary.planned_days > 0 ? `${summary.active_days} / ${summary.planned_days} ngày` : `${summary.active_days} ngày`}
            </dd>
          </div>
          {summary.weak_skill && (
            <div className="rounded-2xl bg-text/5 px-4 py-3 sm:col-span-2">
              <dt className="text-sm text-muted">Nên luyện thêm</dt>
              <dd className="font-semibold">
                {skillLabel(summary.weak_skill)}
                {summary.weak_accuracy !== null && (
                  <span className="font-normal text-muted"> · đúng {Math.round(summary.weak_accuracy * 100)}%</span>
                )}
              </dd>
            </div>
          )}
        </dl>

        {summary.suggestion_vi && (
          <p className="text-[15px]">
            <span className="font-semibold">Gợi ý tuần tới: </span>
            {summary.suggestion_vi}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Link to={notification.action_url} onClick={() => void markClicked()} className={buttonClasses('primary', 'md')}>
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
