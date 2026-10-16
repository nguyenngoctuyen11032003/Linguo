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
    <SolidCard className="group relative p-4 transition-colors hover:border-primary/40">
      <section aria-labelledby={headingId}>
        <h2 id={headingId} className="sr-only">
          Nhịp học tuần này
        </h2>
        <div className="flex items-center gap-3 pr-6 min-[380px]:gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                'inline-flex size-10 items-center justify-center rounded-2xl min-[380px]:size-11',
                streak > 0 ? 'bg-gradient-to-b from-[#ffb347] to-accent text-on-accent shadow-[0_6px_18px_-6px_var(--accent)]' : 'bg-text/8 text-muted',
              )}
            >
              <Flame aria-hidden className="size-[22px] min-[380px]:size-6" fill={streak > 0 ? 'currentColor' : 'none'} />
            </span>
            <p>
              <span className="sr-only">
                {streak > 0 ? `Chuỗi ${streak.toLocaleString('vi-VN')} buổi` : 'Chuỗi mới bắt đầu từ buổi học tiếp theo'}
              </span>
              <span aria-hidden="true" className="block">
                <span className="stat-num block text-[32px] min-[380px]:text-[34px]">{streak.toLocaleString('vi-VN')}</span>
                <span className="eyebrow mt-1 block whitespace-nowrap">buổi liền</span>
              </span>
            </p>
          </div>
          {challenge.target_days > 0 && (
            <div className="min-w-0 flex-1 border-l border-border pl-3 min-[380px]:pl-4">
              <p>
                <span className="sr-only">
                  Thử thách tuần: {done}/{challenge.target_days} ngày
                  {challenge.completed && ' · Đã hoàn thành'}
                </span>
                <span aria-hidden="true" className="eyebrow block whitespace-nowrap">
                  <span className="max-[379px]:hidden">Thử thách </span>tuần
                </span>
              </p>
              <div aria-hidden="true" className="mt-2 flex items-center gap-1">
                {Array.from({ length: challenge.target_days }, (_, i) => (
                  <span
                    key={i}
                    className={cn('h-2 flex-1 rounded-full', i < done ? (challenge.completed ? 'bg-success' : 'bg-accent') : 'bg-text/10')}
                  />
                ))}
                <span className="stat-num ml-1.5 text-[22px]">
                  {done}
                  <span className="text-muted">/{challenge.target_days}</span>
                </span>
              </div>
            </div>
          )}
        </div>
        <Link
          to="/app/tien-do"
          className="absolute inset-0 rounded-[inherit] focus-visible:outline-offset-2"
        >
          {/* The whole strip is the target; the chevron only signals it. */}
          <span className="sr-only">Xem tiến độ</span>
          <ChevronRight aria-hidden className="absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted transition-[color,translate] group-hover:translate-x-0.5 group-hover:text-text" />
        </Link>
      </section>
    </SolidCard>
  );
}
