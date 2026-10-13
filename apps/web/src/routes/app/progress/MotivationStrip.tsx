import { useId } from 'react';
import { ChevronRight, Flame } from 'lucide-react';
import { Link } from 'react-router';
import type { Motivation } from '@linguo/shared';
import { SolidCard } from '@/components/ui/SolidCard';
import { ChallengeBar } from './MotivationPanel';

/** Compact Home strip: streak + weekly challenge + link to Tiến độ. The page hides it when motivation is off. */
export function MotivationStrip({ motivation }: { motivation: Motivation }) {
  const headingId = useId();
  const { streak_current: streak, weekly_challenge: challenge } = motivation;
  return (
    <SolidCard className="p-4">
      <section aria-labelledby={headingId} className="space-y-3">
        <h2 id={headingId} className="sr-only">
          Nhịp học tuần này
        </h2>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <p className="flex min-w-0 items-center gap-2 font-semibold">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-text">
              <Flame aria-hidden className="size-5" />
            </span>
            {streak > 0 ? `Chuỗi ${streak.toLocaleString('vi-VN')} buổi` : 'Chuỗi mới bắt đầu từ buổi học tiếp theo'}
          </p>
          {challenge.target_days > 0 && (
            <div className="min-w-40 flex-1 space-y-1">
              <p className="text-sm">
                Thử thách tuần: {Math.min(challenge.done_days, challenge.target_days)}/{challenge.target_days} ngày
                {challenge.completed && ' · Đã hoàn thành'}
              </p>
              <ChallengeBar done={challenge.done_days} target={challenge.target_days} />
            </div>
          )}
        </div>
        <Link
          to="/app/tien-do"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Xem tiến độ
          <ChevronRight aria-hidden className="size-4 shrink-0" />
        </Link>
      </section>
    </SolidCard>
  );
}
