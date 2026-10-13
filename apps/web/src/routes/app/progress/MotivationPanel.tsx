import { useId, type ReactNode } from 'react';
import { CalendarCheck, Flame, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { STREAK_RULES, XP_RULES, type Motivation } from '@linguo/shared';
import { SolidCard } from '@/components/ui/SolidCard';
import { BadgeGrid } from './BadgeGrid';

const count = (n: number) => n.toLocaleString('vi-VN');

function Block({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0 rounded-2xl bg-text/5 p-4">
      <h3 id={headingId} className="flex items-center gap-2 font-bold">
        <Icon aria-hidden className="size-5 shrink-0 text-accent-text" />
        {title}
      </h3>
      <div className="mt-2 space-y-1 text-[15px]">{children}</div>
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
      <div className="h-full rounded-full bg-accent" style={{ width: `${target > 0 ? Math.round((shown / target) * 100) : 0}%` }} />
    </div>
  );
}

/** Motivation layer (streak, XP, weekly challenge, badges). Kept apart from competence and easy to switch off in Settings. */
export function MotivationPanel({ motivation }: { motivation: Motivation }) {
  const headingId = useId();
  const { weekly_challenge: challenge } = motivation;
  const grace = STREAK_RULES.grace_per_week;

  return (
    <SolidCard>
      <section aria-labelledby={headingId} className="space-y-4">
        <div>
          <h2 id={headingId} className="text-lg font-bold tracking-[-0.02em]">
            Động lực
          </h2>
          <p className="text-sm text-muted">
            Phần này đo sự đều đặn của bạn, không đo trình độ. Bạn có thể ẩn phần này trong{' '}
            <Link to="/app/cai-dat" className="font-semibold text-primary underline underline-offset-4">
              Cài đặt
            </Link>
            .
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Block icon={Flame} title="Chuỗi ngày học">
            <p className="text-2xl font-bold tracking-[-0.02em]">{count(motivation.streak_current)} buổi</p>
            <p className="text-sm text-muted">Dài nhất: {count(motivation.streak_best)} buổi</p>
            {motivation.streak_current === 0 && <p className="text-sm">Buổi học tiếp theo sẽ bắt đầu chuỗi mới.</p>}
            <p className="text-sm">
              Ngày nghỉ theo lịch không làm mất chuỗi; mỗi tuần được bỏ lỡ {grace} buổi.{' '}
              {motivation.grace_left > 0 ? `Tuần này còn ${motivation.grace_left} lượt bỏ lỡ.` : 'Tuần này đã dùng lượt bỏ lỡ.'}
            </p>
          </Block>

          <Block icon={Zap} title="Điểm hoạt động (XP)">
            <p className="text-2xl font-bold tracking-[-0.02em]">{count(motivation.xp_week)} XP tuần này</p>
            <p className="text-sm text-muted">Tổng: {count(motivation.xp_total)} XP</p>
            <p className="text-sm">
              XP đo mức độ hoạt động, không đo trình độ. Tối đa {XP_RULES.daily_cap} XP mỗi ngày, không thưởng cho tốc độ.
            </p>
          </Block>

          <Block icon={CalendarCheck} title="Thử thách tuần">
            {challenge.target_days === 0 ? (
              <p className="text-sm">Tuần này không có ngày học theo lịch.</p>
            ) : (
              <>
                <p className="text-sm">Học đủ các ngày có trong lịch tuần này.</p>
                <p className="text-2xl font-bold tracking-[-0.02em]">
                  {Math.min(challenge.done_days, challenge.target_days)}/{challenge.target_days} ngày
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
            {challenge.completed_weeks > 0 && <p className="text-sm text-muted">Đã đạt {count(challenge.completed_weeks)} tuần</p>}
          </Block>
        </div>

        <BadgeGrid badges={motivation.badges} />
      </section>
    </SolidCard>
  );
}
