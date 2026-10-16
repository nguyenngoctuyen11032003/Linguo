import { AlertTriangle, Check, CloudOff } from 'lucide-react';
import type { ReviewGradeResult, ReviewQueue, ReviewSummary } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
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
    <section aria-labelledby="review-summary-title" className="space-y-5">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-[image:var(--hero-bg)] p-5 text-white shadow-[0_24px_60px_-24px_rgb(7_11_18/0.8)] ring-1 ring-white/10 ring-inset">
        <span aria-hidden="true" className="absolute -bottom-24 -left-16 -z-10 size-64 rounded-full bg-accent/30 blur-3xl" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h2
              id="review-summary-title"
              tabIndex={-1}
              className="scroll-mt-[calc(7rem+env(safe-area-inset-top,0px))] font-display text-[clamp(34px,10vw,44px)] font-extrabold uppercase leading-[1.06] focus:outline-none"
            >
              Xong phiên ôn
            </h2>
            <p className="text-[14px] leading-snug text-white/75">Đã ôn {reviewedCount} thẻ. Nghỉ ngơi cũng là một phần của việc nhớ lâu.</p>
          </div>
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-full bg-[#7ee2ae] text-[#06251a] shadow-[0_4px_0_#2f9a6a]"
          >
            <Check className="size-6" strokeWidth={3.5} />
          </span>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5">
          {stats.map(([label, value], i) => (
            <div key={label} className={i % 2 === 1 ? 'border-l border-white/12 pl-4' : undefined}>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-white/65">{label}</dt>
              <dd
                className={
                  i === 0
                    ? 'stat-num mt-2 bg-gradient-to-b from-white to-white/55 bg-clip-text pr-1 text-[48px] text-transparent'
                    : 'stat-num mt-2 text-[40px] text-white'
                }
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {summary && summary.retention_30d !== null && (
          <p className="mt-5 border-t border-white/12 pt-4 text-[14px] font-semibold text-white/85">
            Tỷ lệ nhớ 30 ngày: {percent(summary.retention_30d)}
          </p>
        )}
      </div>

        {droppedCount > 0 && (
          <p role="status" className="flex items-center gap-2 rounded-2xl bg-warn/15 px-4 py-3 text-[15px] font-medium ring-1 ring-warn/40 ring-inset">
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            {droppedCount} thẻ chưa lưu được kết quả nên cần ôn lại.
          </p>
        )}

        {pendingCount > 0 && (
          <p role="status" className="flex items-center gap-2 rounded-2xl bg-warn/15 px-4 py-3 text-[15px] font-medium ring-1 ring-warn/40 ring-inset">
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
  );
}
