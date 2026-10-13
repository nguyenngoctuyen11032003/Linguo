import { CalendarClock } from 'lucide-react';
import { Link } from 'react-router';
import type { StudySession } from '@linguo/shared';
import { buttonClasses } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { SESSION_PAGE_PATH } from '@/features/session-link/params';
import { useTodaySession } from '@/features/session-link/useTodaySession';

const SHORT_SESSION_PATH = `${SESSION_PAGE_PATH}?phut=10`;

function isOpen(session: StudySession | null): session is StudySession {
  return !!session && (session.status === 'planned' || session.status === 'in_progress');
}

/** Activities finished or skipped / all activities of a session. */
function progress(session: StudySession): { finished: number; total: number } {
  const { activities } = session.plan;
  return { finished: activities.filter((a) => a.status !== 'pending').length, total: activities.length };
}

/**
 * Home "Hôm nay" card (spec 6 §4): today's goal vs minutes studied, start or resume the study session, the plan's
 * focus and its priority skill. Hidden when the planner RPC is not available; a load error leaves a small retry.
 */
export function TodayCard({ pathId }: { pathId: string }) {
  const { status, data, reload } = useTodaySession(pathId);

  if (status === 'unavailable') return null;

  if (status === 'loading') {
    return (
      <SolidCard>
        <div role="status" className="space-y-3">
          <span className="sr-only">Đang tải phiên học hôm nay…</span>
          <Skeleton className="block h-6 w-40" />
          <Skeleton className="block h-4 w-56" />
          <Skeleton className="block h-12 w-full rounded-full" />
        </div>
      </SolidCard>
    );
  }

  if (status === 'error' || !data) {
    return (
      <SolidCard>
        <section aria-labelledby="today-title" className="space-y-2">
          <h2 id="today-title" className="text-lg font-bold tracking-[-0.02em]">
            Hôm nay
          </h2>
          <p role="alert" className="text-[15px] text-muted">
            Chưa tải được phiên học hôm nay.
          </p>
          <button
            type="button"
            onClick={reload}
            className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
          >
            Thử lại
          </button>
        </section>
      </SolidCard>
    );
  }

  const { session, daily_goal_minutes: goal } = data;
  const studied = Math.floor(data.studied_seconds_today / 60);
  const open = isOpen(session);
  const step = open ? progress(session) : null;
  const practice = session?.plan.activities.find((a) => a.kind === 'practice') ?? null;

  return (
    <SolidCard>
      <section aria-labelledby="today-title" className="space-y-4">
        <div className="flex items-start gap-4">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <CalendarClock aria-hidden className="size-6" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id="today-title" className="text-lg font-bold tracking-[-0.02em]">
              Hôm nay
            </h2>
            <p className="text-[15px] text-muted">
              {goal > 0 ? `Mục tiêu ${goal} phút · Đã học ${studied} phút` : `Hôm nay không có lịch học · Đã học ${studied} phút`}
            </p>
          </div>
        </div>

        {goal > 0 && (
          <div
            role="progressbar"
            aria-label="Thời gian học hôm nay"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(studied, goal)}
            aria-valuetext={`${studied}/${goal} phút`}
            className="h-2 overflow-hidden rounded-full bg-text/10"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (studied / goal) * 100)}%` }} />
          </div>
        )}

        {session && <p className="text-[17px] font-semibold leading-snug">{session.plan.focus_vi}</p>}
        {practice && (
          <p className="text-[15px]">
            <span className="font-semibold">Kỹ năng ưu tiên: {practice.title_vi}.</span>{' '}
            <span className="text-muted">{practice.reason_vi}</span>
          </p>
        )}
        {session?.status === 'completed' && <p className="text-[15px] font-semibold text-success-text">Bạn đã xong phiên học hôm nay.</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Link to={SESSION_PAGE_PATH} className={buttonClasses('primary', 'lg', true)}>
            {step ? `Tiếp tục phiên (${step.finished}/${step.total})` : 'Bắt đầu phiên học'}
          </Link>
          {!open && (
            <Link
              to={SHORT_SESSION_PATH}
              className="inline-flex min-h-11 shrink-0 items-center justify-center font-semibold text-primary underline-offset-4 hover:underline"
            >
              Chỉ có 10 phút?
            </Link>
          )}
        </div>
      </section>
    </SolidCard>
  );
}
