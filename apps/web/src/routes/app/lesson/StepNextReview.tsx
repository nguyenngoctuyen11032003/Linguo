import { CalendarCheck, Check } from 'lucide-react';
import { formatDateVi, todayIso } from '@/lib/dates';

/** When the learner should review this lesson, as a date in their timezone. */
export function StepNextReview({ nextReviewAt, timeZone }: { nextReviewAt: string | null; timeZone: string }) {
  const date = nextReviewAt ? new Date(nextReviewAt) : null;
  const valid = date !== null && !Number.isNaN(date.getTime());
  return (
    <div className="space-y-4">
      <div aria-hidden="true" className="relative mx-auto grid size-28 place-items-center">
        <span className="absolute inset-0 rounded-full bg-success/15" />
        <span className="absolute inset-3 rounded-full bg-success/20" />
        <span className="relative grid size-16 place-items-center rounded-full bg-success text-bg shadow-[0_5px_0_color-mix(in_srgb,var(--success)_55%,black)]">
          <Check className="size-8" strokeWidth={3.5} />
        </span>
      </div>
      <p className="text-center">Bạn đã hoàn thành bài học. Ôn lại đúng hẹn giúp bạn nhớ lâu hơn.</p>
      <div className="card flex items-center gap-4 p-5">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <CalendarCheck aria-hidden className="size-6" />
        </span>
        {valid ? (
          <dl className="space-y-1.5">
            <dt className="eyebrow">Lần ôn tiếp theo</dt>
            <dd className="stat-num text-[34px]">{formatDateVi(todayIso(timeZone, date))}</dd>
          </dl>
        ) : (
          <p>Lịch ôn tập sẽ được cập nhật sau.</p>
        )}
      </div>
    </div>
  );
}
