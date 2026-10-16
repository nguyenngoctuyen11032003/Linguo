import type { ReactNode } from 'react';
import type { ProgressDashboard } from '@linguo/shared';
import { cn } from '@/lib/cn';
import { PROGRESS_TERMS, percent } from './labels';

interface TotalsGridProps {
  totals: ProgressDashboard['totals'];
  /** review_summary.retention_30d / retention_sample. */
  retention: { value: number | null; sample: number };
  masteredTotal: number;
  /** Length of the selected range, for the range-minutes label. */
  rangeDays: number;
}

function Stat({ term, children, hint, wide = false }: { term: string; children: ReactNode; hint?: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-[1.25rem] bg-text/[0.04] p-3 min-[380px]:p-3.5', wide && 'col-span-2 sm:col-span-1')}>
      <dt className="eyebrow leading-tight">{term}</dt>
      <dd className="mt-2 flex flex-wrap items-baseline gap-x-1">{children}</dd>
      {hint && <dd className="mt-1.5 text-xs leading-snug text-muted">{hint}</dd>}
    </div>
  );
}

/** A big number followed by a small unit; spaces keep the text readable as "1 giờ 30 phút". */
function Big({ value, unit }: { value: ReactNode; unit?: string }) {
  return (
    <>
      <span className="stat-num text-[32px] min-[380px]:text-[38px]">{value}</span>
      {unit && <span className="text-xs font-semibold text-muted min-[380px]:text-[13px]"> {unit} </span>}
    </>
  );
}

/** Minutes as big numerals with small units: 45 phút, 1 giờ 30 phút, 2 giờ. */
function Duration({ minutes }: { minutes: number }) {
  if (minutes < 60) return <Big value={minutes} unit="phút" />;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return (
    <>
      <Big value={h} unit="giờ" />
      {m > 0 && <Big value={m} unit="phút" />}
    </>
  );
}

const count = (n: number) => n.toLocaleString('vi-VN');

/** Activity totals (time, lessons, reviews, application) and learning numbers (retention, mastered items). */
export function TotalsGrid({ totals, retention, masteredTotal, rangeDays }: TotalsGridProps) {
  const weekGoal = totals.week_goal_minutes;
  const weekShare = weekGoal > 0 ? Math.min(1, totals.week_minutes / weekGoal) : 0;
  return (
    <dl className="grid grid-cols-2 gap-2 min-[380px]:gap-2.5 sm:grid-cols-3">
      <Stat term="Hôm nay">
        <Duration minutes={totals.today_minutes} />
      </Stat>
      <Stat
        term="Tuần này"
        hint={
          weekGoal > 0 ? (
            <>
              <span>
                {count(totals.week_minutes)} / {count(weekGoal)} phút mục tiêu
              </span>
              <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-text/10">
                <span className="block h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${Math.round(weekShare * 100)}%` }} />
              </span>
            </>
          ) : (
            'Không có mục tiêu tuần này'
          )
        }
      >
        <Duration minutes={totals.week_minutes} />
      </Stat>
      <Stat term={PROGRESS_TERMS.rangeMinutes(rangeDays)} wide>
        <Duration minutes={totals.range_minutes} />
      </Stat>
      <Stat term="Bài đã xong">
        <Big value={count(totals.lessons_completed)} />
      </Stat>
      <Stat term="Lượt ôn">
        <Big value={count(totals.reviews_done)} />
      </Stat>
      <Stat term={PROGRESS_TERMS.applicationCorrect} hint={PROGRESS_TERMS.applicationCorrectHint}>
        <Big value={count(totals.application_done)} />
      </Stat>
      <Stat
        term={PROGRESS_TERMS.longTermRecall}
        hint={retention.value === null ? 'Cần thêm lượt ôn thẻ cũ' : `Trong 30 ngày, trên ${count(retention.sample)} lượt ôn`}
      >
        {retention.value === null ? (
          <span className="text-[15px] font-semibold text-muted">Chưa đủ dữ liệu</span>
        ) : (
          <span className="stat-num text-[32px] text-success-text min-[380px]:text-[38px]">{percent(retention.value)}</span>
        )}
      </Stat>
      <Stat term="Mục đã thành thạo" wide>
        <Big value={count(masteredTotal)} />
      </Stat>
    </dl>
  );
}
