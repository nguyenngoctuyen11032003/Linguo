import type { ReactNode } from 'react';
import type { ProgressDashboard } from '@linguo/shared';
import { formatMinutes } from '@/features/learning-paths/components/schedule';
import { PROGRESS_TERMS, percent } from './labels';

interface TotalsGridProps {
  totals: ProgressDashboard['totals'];
  /** review_summary.retention_30d / retention_sample. */
  retention: { value: number | null; sample: number };
  masteredTotal: number;
  /** Length of the selected range, for the range-minutes label. */
  rangeDays: number;
}

function Stat({ term, children, hint }: { term: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl bg-text/5 p-3">
      <dt className="text-sm text-muted">{term}</dt>
      <dd className="mt-0.5 text-lg font-bold tracking-[-0.01em]">{children}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}

const count = (n: number) => n.toLocaleString('vi-VN');

/** Activity totals (time, lessons, reviews, application) and learning numbers (retention, mastered items). */
export function TotalsGrid({ totals, retention, masteredTotal, rangeDays }: TotalsGridProps) {
  const weekGoal = totals.week_goal_minutes;
  const weekShare = weekGoal > 0 ? Math.min(1, totals.week_minutes / weekGoal) : 0;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Stat term="Hôm nay">{formatMinutes(totals.today_minutes)}</Stat>
      <Stat
        term="Tuần này"
        hint={
          weekGoal > 0 ? (
            <>
              <span>
                {count(totals.week_minutes)} / {count(weekGoal)} phút mục tiêu
              </span>
              <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-text/10">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(weekShare * 100)}%` }} />
              </span>
            </>
          ) : (
            'Không có mục tiêu tuần này'
          )
        }
      >
        {formatMinutes(totals.week_minutes)}
      </Stat>
      <Stat term={PROGRESS_TERMS.rangeMinutes(rangeDays)}>{formatMinutes(totals.range_minutes)}</Stat>
      <Stat term="Bài đã xong">{count(totals.lessons_completed)}</Stat>
      <Stat term="Lượt ôn">{count(totals.reviews_done)}</Stat>
      <Stat term={PROGRESS_TERMS.applicationCorrect} hint={PROGRESS_TERMS.applicationCorrectHint}>
        {count(totals.application_done)}
      </Stat>
      <Stat
        term={PROGRESS_TERMS.longTermRecall}
        hint={retention.value === null ? 'Cần thêm lượt ôn thẻ cũ' : `Trong 30 ngày, trên ${count(retention.sample)} lượt ôn`}
      >
        {retention.value === null ? <span className="text-base font-semibold text-muted">Chưa đủ dữ liệu</span> : percent(retention.value)}
      </Stat>
      <Stat term="Mục đã thành thạo">{count(masteredTotal)}</Stat>
    </dl>
  );
}
