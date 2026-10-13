import { CalendarCheck } from 'lucide-react';
import { formatDateVi, todayIso } from '@/lib/dates';

/** When the learner should review this lesson, as a date in their timezone. */
export function StepNextReview({ nextReviewAt, timeZone }: { nextReviewAt: string | null; timeZone: string }) {
  const date = nextReviewAt ? new Date(nextReviewAt) : null;
  const valid = date !== null && !Number.isNaN(date.getTime());
  return (
    <div className="space-y-4">
      <p>Bạn đã hoàn thành bài học. Ôn lại đúng hẹn giúp bạn nhớ lâu hơn.</p>
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface-solid p-4">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <CalendarCheck aria-hidden className="size-6" />
        </span>
        {valid ? (
          <dl>
            <dt className="text-sm text-muted">Lần ôn tiếp theo</dt>
            <dd className="text-xl font-bold">{formatDateVi(todayIso(timeZone, date))}</dd>
          </dl>
        ) : (
          <p>Lịch ôn tập sẽ được cập nhật sau.</p>
        )}
      </div>
    </div>
  );
}
