import { useId } from 'react';
import { ChevronRight, Flame } from 'lucide-react';
import { Link } from 'react-router';
import type { Motivation } from '@linguo/shared';
import { SolidCard } from '@/components/ui/SolidCard';
import { cn } from '@/lib/cn';

/** Compact Home strip: streak + weekly challenge + link to Tiến độ. The page hides it when motivation is off. */
export function MotivationStrip({ motivation }: { motivation: Motivation }) {
  const headingId = useId();
  const { streak_current: streak, weekly_challenge: challenge } = motivation;
  const done = Math.min(challenge.done_days, challenge.target_days);
  return (
    <SolidCard className="relative p-4">
      <section aria-labelledby={headingId}>
        <h2 id={headingId} className="sr-only">
          Nhịp học tuần này
        </h2>
        <div className="flex items-center gap-4 pr-10">
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                'inline-flex size-11 items-center justify-center rounded-2xl',
                streak > 0 ? 'bg-gradient-to-b from-[#ffb347] to-accent text-on-accent shadow-[0_6px_18px_-6px_var(--accent)]' : 'bg-text/8 text-muted',
              )}
            >
              <Flame aria-hidden className="size-6" fill={streak > 0 ? 'currentColor' : 'none'} />
            </span>
            <p>
              <span className="sr-only">
                {streak > 0 ? `Chuỗi ${streak.toLocaleString('vi-VN')} buổi` : 'Chuỗi mới bắt đầu từ buổi học tiếp theo'}
              </span>
              <span aria-hidden="true" className="block">
                <span className="stat-num block text-[34px]">{streak.toLocaleString('vi-VN')}</span>
                <span className="eyebrow">buổi liền</span>
              </span>
            </p>
          </div>
          {challenge.target_days > 0 && (
            <div className="min-w-0 flex-1 border-l border-border pl-4">
              <p>
                <span className="sr-only">
                  Thử thách tuần: {done}/{challenge.target_days} ngày
                  {challenge.completed && ' · Đã hoàn thành'}
                </span>
                <span aria-hidden="true" className="flex items-baseline justify-between gap-2">
                  <span className="eyebrow">Thử thách tuần</span>
                  <span className="text-sm font-bold">
                    {done}/{challenge.target_days}
                  </span>
                </span>
              </p>
              <div aria-hidden="true" className="mt-2 flex gap-1">
                {Array.from({ length: challenge.target_days }, (_, i) => (
                  <span
                    key={i}
                    className={cn('h-2 flex-1 rounded-full', i < done ? (challenge.completed ? 'bg-success' : 'bg-accent') : 'bg-text/10')}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <Link
          to="/app/tien-do"
          className="absolute right-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/6 hover:text-text"
        >
          <span className="sr-only">Xem tiến độ</span>
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      </section>
    </SolidCard>
  );
}
