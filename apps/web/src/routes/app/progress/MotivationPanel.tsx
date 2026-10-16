import { useId, type ReactNode } from 'react';
import { CalendarCheck, Flame, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { STREAK_RULES, XP_RULES, type Motivation } from '@linguo/shared';
import { SolidCard } from '@/components/ui/SolidCard';
import { cn } from '@/lib/cn';
import { BadgeGrid } from './BadgeGrid';

const count = (n: number) => n.toLocaleString('vi-VN');

function Block({ icon: Icon, title, children, tone }: { icon: LucideIcon; title: string; children: ReactNode; tone: string }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="relative isolate min-w-0 overflow-hidden rounded-[1.25rem] bg-text/[0.04] p-4">
      <Icon aria-hidden className={cn('pointer-events-none absolute -right-5 -top-5 -z-10 size-20 opacity-[0.08]', tone)} />
      <h3 id={headingId} className="eyebrow flex items-center gap-1.5">
        <Icon aria-hidden className={cn('size-4 shrink-0', tone)} />
        {title}
      </h3>
      <div className="mt-2 space-y-1.5 text-[13px] leading-snug text-muted">{children}</div>
    </section>
  );
}

/** Weekly challenge done/target days as an accessible progress bar. */
export function ChallengeBar({ done, target }: { done: number; target: number }) {
  const shown = Math.min(done, target);
  return (
    <div
      role="progressbar"
      aria-label="Thử thách tuần"
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={shown}
      aria-valuetext={`${shown}/${target} ngày`}
      className="h-2 overflow-hidden rounded-full bg-text/10"
    >
      <div className="h-full rounded-full bg-gradient-to-r from-accent to-[#ffc06b]" style={{ width: `${target > 0 ? Math.round((shown / target) * 100) : 0}%` }} />
    </div>
  );
}

/** Motivation layer (streak, XP, weekly challenge, badges). Kept apart from competence and easy to switch off in Settings. */
export function MotivationPanel({ motivation }: { motivation: Motivation }) {
  const headingId = useId();
  const { weekly_challenge: challenge } = motivation;
  const grace = STREAK_RULES.grace_per_week;

  return (
    <SolidCard className="p-5 lg:p-6">
      <section aria-labelledby={headingId} className="space-y-4">
        <div>
          <h2 id={headingId} className="text-xl font-extrabold tracking-[-0.02em]">
            Động lực
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            Phần này đo sự đều đặn của bạn, không đo trình độ. Bạn có thể ẩn phần này trong{' '}
            <Link to="/app/cai-dat" className="font-semibold text-primary underline underline-offset-4">
              Cài đặt
            </Link>
            .
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Block icon={Flame} title="Chuỗi ngày học" tone="text-accent-text">
            <p className="text-text">
              <span className="stat-num text-[56px]">{count(motivation.streak_current)}</span>
              <span className="text-[15px] font-bold"> buổi</span>
            </p>
            <p>Dài nhất: {count(motivation.streak_best)} buổi</p>
            {motivation.streak_current === 0 && <p>Buổi học tiếp theo sẽ bắt đầu chuỗi mới.</p>}
            <p>
              Ngày nghỉ theo lịch không làm mất chuỗi; mỗi tuần được bỏ lỡ {grace} buổi.{' '}
              {motivation.grace_left > 0 ? `Tuần này còn ${motivation.grace_left} lượt bỏ lỡ.` : 'Tuần này đã dùng lượt bỏ lỡ.'}
            </p>
          </Block>

          <Block icon={Zap} title="Điểm hoạt động (XP)" tone="text-gold">
            <p className="text-text">
              <span className="stat-num text-[56px]">{count(motivation.xp_week)}</span>
              <span className="text-[15px] font-bold"> XP tuần này</span>
            </p>
            <p>Tổng: {count(motivation.xp_total)} XP</p>
            <p>
              XP đo mức độ hoạt động, không đo trình độ. Tối đa {XP_RULES.daily_cap} XP mỗi ngày, không thưởng cho tốc độ.
            </p>
          </Block>

          <Block icon={CalendarCheck} title="Thử thách tuần" tone="text-primary">
            {challenge.target_days === 0 ? (
              <p>Tuần này không có ngày học theo lịch.</p>
            ) : (
              <>
                <p>Học đủ các ngày có trong lịch tuần này.</p>
                <p className="text-text">
                  <span className="stat-num text-[56px]">
                    {Math.min(challenge.done_days, challenge.target_days)}/{challenge.target_days}
                  </span>
                  <span className="text-[15px] font-bold"> ngày</span>
                </p>
                <ChallengeBar done={challenge.done_days} target={challenge.target_days} />
                {challenge.completed && (
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-success-text">
                    <Sparkles aria-hidden className="size-4 shrink-0" />
                    Đã hoàn thành thử thách tuần này
                  </p>
                )}
              </>
            )}
            {challenge.completed_weeks > 0 && <p>Đã đạt {count(challenge.completed_weeks)} tuần</p>}
          </Block>
        </div>

        <BadgeGrid badges={motivation.badges} />
      </section>
    </SolidCard>
  );
}
