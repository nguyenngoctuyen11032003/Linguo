import { useId } from 'react';
import { CircleDashed, Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { MIN_ACCURACY_SAMPLE, type ProgressRange } from '@linguo/shared';
import { cn } from '@/lib/cn';
import { percent, type AccuracyRow } from './labels';

interface Delta {
  icon: LucideIcon;
  text: string;
  className: string;
}

/** Change against the previous window of equal length, always in words + icon (never colour alone). */
function delta(row: AccuracyRow, rangeDays: ProgressRange): Delta | null {
  if (row.accuracy === null) return null;
  const since = `so với ${rangeDays} ngày trước`;
  if (row.prev_accuracy === null) {
    return { icon: CircleDashed, text: `Chưa có dữ liệu ${rangeDays} ngày trước để so sánh`, className: 'text-muted' };
  }
  const points = Math.round(row.accuracy * 100) - Math.round(row.prev_accuracy * 100);
  if (points > 0) return { icon: TrendingUp, text: `Tăng ${points} điểm ${since}`, className: 'text-success-text' };
  if (points < 0) return { icon: TrendingDown, text: `Giảm ${-points} điểm ${since}`, className: 'text-muted' };
  return { icon: Minus, text: `Không đổi ${since}`, className: 'text-muted' };
}

interface AccuracyListProps {
  title: string;
  rows: AccuracyRow[];
  rangeDays: ProgressRange;
}

/** First-try accuracy per skill or exercise type in the selected window. */
export function AccuracyList({ title, rows, rangeDays }: AccuracyListProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <h3 id={headingId} className="text-base font-bold">
        {title}
      </h3>
      <ul className="mt-3 space-y-4">
        {rows.map((row) => {
          const change = delta(row, rangeDays);
          const Icon = change?.icon;
          return (
            <li key={row.key} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-semibold">{row.label}</span>
                <span className="shrink-0 text-sm text-muted">{row.attempts} câu</span>
              </div>
              {row.accuracy === null ? (
                <p className="mt-1 text-sm text-muted">Chưa đủ dữ liệu (cần ≥ {MIN_ACCURACY_SAMPLE} câu)</p>
              ) : (
                <>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div aria-hidden="true" className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-text/10">
                      <div className="h-full rounded-full bg-primary" style={{ width: percent(row.accuracy) }} />
                    </div>
                    <span className="w-11 shrink-0 text-right font-semibold tabular-nums">{percent(row.accuracy)}</span>
                  </div>
                  {change && Icon && (
                    <p className={cn('mt-1 flex items-center gap-1.5 text-sm', change.className)}>
                      <Icon aria-hidden className="size-4 shrink-0" />
                      <span>{change.text}</span>
                    </p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
