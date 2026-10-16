import { AlertTriangle, CheckCircle2, CloudOff } from 'lucide-react';
import type { ReviewGradeResult, ReviewQueue, ReviewSummary } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { hasMoreCards } from './more';

interface Props {
  /** Cards rated in this visit, including ones still waiting in the outbox. */
  reviewedCount: number;
  /** Cards rated in this visit whose queued grade the server dropped: not reviewed, still due. */
  droppedCount?: number;
  graded: ReviewGradeResult[];
  pendingCount: number;
  summary: ReviewSummary | null;
  totals: ReviewQueue['totals'] | null;
  loadingMore: boolean;
  onMore: () => void;
  onDone: () => void;
  /** Opened from a study session: "Quay lại phiên học" becomes the main action and no extra cards are offered. */
  session?: { onReturn: () => void; returning: boolean };
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** End of a review session: what was done, what is next, and a clear way to stop. */
export function ReviewSummaryView({ reviewedCount, droppedCount = 0, graded, pendingCount, summary, totals, loadingMore, onMore, onDone, session }: Props) {
  const remembered = graded.filter((g) => g.rating_effective >= 3).length;
  const mastered = graded.filter((g) => g.newly_mastered).length;
  const tomorrow = summary?.forecast[1]?.count ?? null;
  const stats: Array<[string, string]> = [
    ['Đã ôn', `${reviewedCount} thẻ`],
    ['Nhớ được', graded.length > 0 ? percent(remembered / graded.length) : '—'],
    ['Từ mới vững', `${mastered}`],
    ['Ngày mai', tomorrow === null ? '—' : `${tomorrow} thẻ`],
  ];

  return (
    <SolidCard className="space-y-5">
      <section aria-labelledby="review-summary-title" className="space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden className="mt-0.5 size-6 shrink-0 text-success" />
          <div className="min-w-0 space-y-1">
            <h2 id="review-summary-title" tabIndex={-1} className="text-xl font-bold tracking-[-0.02em] focus:outline-none">
              Xong phiên ôn
            </h2>
            <p className="text-[15px] text-muted">Đã ôn {reviewedCount} thẻ. Nghỉ ngơi cũng là một phần của việc nhớ lâu.</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-text/5 px-4 py-3">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="text-xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>

        {summary && summary.retention_30d !== null && (
          <p className="text-[15px]">Tỷ lệ nhớ 30 ngày: {percent(summary.retention_30d)}</p>
        )}

        {droppedCount > 0 && (
          <p role="status" className="flex items-center gap-2 rounded-2xl bg-warn/15 px-4 py-3 text-[15px]">
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            {droppedCount} thẻ chưa lưu được kết quả nên cần ôn lại.
          </p>
        )}

        {pendingCount > 0 && (
          <p role="status" className="flex items-center gap-2 rounded-2xl bg-warn/15 px-4 py-3 text-[15px]">
            <CloudOff aria-hidden className="size-4 shrink-0" />
            Còn {pendingCount} thẻ đang chờ đồng bộ
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          {session && (
            <div className="flex-1">
              <Button variant="accent" size="lg" block loading={session.returning} onClick={session.onReturn}>
                Quay lại phiên học
              </Button>
            </div>
          )}
          <div className="flex-1">
            <Button variant={session ? 'ghost' : 'accent'} size="lg" block onClick={onDone}>
              Hôm nay đủ rồi
            </Button>
          </div>
          {!session && hasMoreCards(totals) && (
            <div className="flex-1">
              <Button variant="ghost" size="lg" block loading={loadingMore} onClick={onMore}>
                +10 thẻ nữa
              </Button>
            </div>
          )}
        </div>
      </section>
    </SolidCard>
  );
}
