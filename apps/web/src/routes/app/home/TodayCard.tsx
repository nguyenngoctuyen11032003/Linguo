import { ArrowRight, Target, Zap } from 'lucide-react';
import { Link } from 'react-router';
import type { StudySession } from '@linguo/shared';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { SESSION_PAGE_PATH } from '@/features/session-link/params';
import { useTodaySession } from '@/features/session-link/useTodaySession';
import { cn } from '@/lib/cn';

const SHORT_SESSION_PATH = `${SESSION_PAGE_PATH}?phut=10`;

function isOpen(session: StudySession | null): session is StudySession {
  return !!session && (session.status === 'planned' || session.status === 'in_progress');
}

/** Activities finished or skipped / all activities of a session. */
function progress(session: StudySession): { finished: number; total: number } {
  const { activities } = session.plan;
  return { finished: activities.filter((a) => a.status !== 'pending').length, total: activities.length };
}

/** Decorative route line (map motif) in the hero's corner. */
function RouteMotif() {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 140" className="pointer-events-none absolute -right-6 -top-4 w-56 opacity-60" fill="none">
      <path
        d="M10 120C60 130 50 40 110 60S170 10 195 20"
        stroke="url(#today-route)"
        strokeWidth="2"
        strokeDasharray="2 6"
        strokeLinecap="round"
      />
      <circle cx="110" cy="60" r="4.5" fill="#ffffff" fillOpacity="0.85" />
      <circle cx="195" cy="20" r="4" fill="var(--accent)" />
      <defs>
        <linearGradient id="today-route" x1="0" x2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Home "Hôm nay" hero (spec 6 §4): minutes studied vs today's goal as one big number, start or resume the study
 * session, the plan's focus and its priority skill. Hidden when the planner RPC is not available; a load error leaves
 * a small retry.
 */
export function TodayCard({ pathId }: { pathId: string }) {
  const { status, data, reload } = useTodaySession(pathId);

  if (status === 'unavailable') return null;

  if (status === 'loading') {
    return (
      <SolidCard className="min-h-[21.25rem] rounded-[2rem]">
        <div role="status" className="space-y-3">
          <span className="sr-only">Đang tải phiên học hôm nay…</span>
          <Skeleton className="block h-4 w-24" />
          <Skeleton className="block h-16 w-40" />
          <Skeleton className="block h-2 w-full" />
          <Skeleton className="block h-13 w-full rounded-full" />
        </div>
      </SolidCard>
    );
  }

  if (status === 'error' || !data) {
    return (
      <SolidCard>
        <section aria-labelledby="today-title" className="space-y-2">
          <h2 id="today-title" className="eyebrow">
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
  const done = session?.status === 'completed';
  const pct = goal > 0 ? Math.min(100, (studied / goal) * 100) : 0;

  return (
    <section
      aria-labelledby="today-title"
      className="relative isolate overflow-hidden rounded-[2rem] bg-[image:var(--hero-bg)] p-5 text-white shadow-[0_24px_60px_-24px_rgb(7_11_18/0.8)] ring-1 ring-white/10 ring-inset"
    >
      <div aria-hidden="true" className="absolute -bottom-24 -left-16 -z-10 size-64 rounded-full bg-accent/30 blur-3xl" />
      <RouteMotif />

      <div className="relative flex items-center justify-between gap-3">
        <h2 id="today-title" className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
          Hôm nay
        </h2>
        {goal > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-xs font-semibold text-white/90 backdrop-blur">
            <Target aria-hidden className="size-3.5" />
            {Math.round(pct)}%
          </span>
        )}
      </div>

      <p className="sr-only">
        {goal > 0 ? `Mục tiêu ${goal} phút · Đã học ${studied} phút` : `Hôm nay không có lịch học · Đã học ${studied} phút`}
      </p>
      <p aria-hidden="true" className="relative mt-3 flex items-end gap-2">
        <span className="stat-num bg-gradient-to-b from-white to-white/55 bg-clip-text pr-1 text-[88px] text-transparent">{studied}</span>
        <span className="pb-2 text-[15px] font-semibold leading-tight text-white/70">
          {goal > 0 ? (
            <>
              /{goal}
              <br />
              phút
            </>
          ) : (
            <>
              phút
              <br />
              đã học
            </>
          )}
        </span>
      </p>

      {goal > 0 && (
        <div
          role="progressbar"
          aria-label="Thời gian học hôm nay"
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-valuenow={Math.min(studied, goal)}
          aria-valuetext={`${studied}/${goal} phút`}
          className="mt-4 h-2 overflow-hidden rounded-full bg-white/15"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-[#ffc06b] shadow-[0_0_12px_var(--accent)] transition-[width] duration-700 ease-[var(--ease-expo)]"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {step && (
        <div aria-hidden="true" className="mt-3 flex gap-1.5">
          {Array.from({ length: step.total }, (_, i) => (
            <span key={i} className={cn('h-1 flex-1 rounded-full', i < step.finished ? 'bg-white' : 'bg-white/20')} />
          ))}
        </div>
      )}

      {(session || practice) && (
        <div className="mt-4 space-y-1.5">
          {session && <p className="text-[17px] font-bold leading-snug tracking-[-0.01em]">{session.plan.focus_vi}</p>}
          {practice && (
            <p className="flex items-start gap-1.5 text-[13px] leading-snug text-white/70">
              <Zap aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[#ffc06b]" />
              <span>
                <span className="font-semibold text-white">Kỹ năng ưu tiên: {practice.title_vi}.</span>{' '}
                <span>{practice.reason_vi}</span>
              </span>
            </p>
          )}
          {done && <p className="text-[15px] font-semibold text-[#7ee2ae]">Bạn đã xong phiên học hôm nay.</p>}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          to={SESSION_PAGE_PATH}
          className="press-accent inline-flex min-h-13 min-w-0 flex-1 basis-56 items-center justify-between gap-2 rounded-full bg-accent py-1.5 pl-4 pr-1.5 text-[15px] font-bold text-on-accent min-[380px]:gap-3 min-[380px]:pl-5 min-[380px]:text-[16px] transition-[translate,box-shadow,filter] duration-150 hover:brightness-110"
        >
          <span className="min-w-0 truncate">{step ? `Tiếp tục phiên (${step.finished}/${step.total})` : 'Bắt đầu phiên học'}</span>
          <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#0b1420] text-white">
            <ArrowRight className="size-5" />
          </span>
        </Link>
        {!open && (
          <Link
            to={SHORT_SESSION_PATH}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-2 text-sm font-semibold text-white/85 underline-offset-4 hover:underline"
          >
            Chỉ có 10 phút?
          </Link>
        )}
      </div>
    </section>
  );
}
