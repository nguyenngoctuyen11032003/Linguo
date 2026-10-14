import { useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { DEFAULT_TIMEZONE } from '@linguo/shared';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { setPathStatus } from '@/features/learning-paths/service';
import { useProfile } from '@/features/profile/ProfileProvider';
import { resolveTimeZone } from '@/lib/dates';
import { requireSupabase } from '@/lib/supabase';
import { DiagnosticCard } from './home/DiagnosticCard';
import { NextLessonCard } from './home/NextLessonCard';
import { PathSummaryCard } from './home/PathSummaryCard';
import { ReviewDueCard } from './home/ReviewDueCard';
import { SpeakingCard } from './home/SpeakingCard';
import { SpreadWarning } from './home/SpreadWarning';
import { TodayCard } from './home/TodayCard';
import { WeeklySummaryCard } from './home/WeeklySummaryCard';
import { HomeMotivation } from './progress/HomeMotivation';

const todayLabel = (timeZone: string) =>
  new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(new Date());

export function HomePage() {
  const { status, profile, reload } = useProfile();
  const paths = useLearningPaths();
  const toast = useToast();
  const [resuming, setResuming] = useState(false);
  const cardHeadingRef = useRef<HTMLHeadingElement>(null);
  const name = profile?.displayName.trim();
  const timeZone = resolveTimeZone(profile?.timezone ?? DEFAULT_TIMEZONE);

  if (paths.status === 'ready' && paths.paths.length === 0) return <Navigate to="/app/bat-dau" replace />;

  async function resume() {
    if (!paths.current) return;
    setResuming(true);
    try {
      paths.upsertPath(await setPathStatus(requireSupabase(), paths.current.id, 'active'));
      toast.show({ tone: 'success', message: 'Đã tiếp tục lộ trình.' });
      // The "Tiếp tục lộ trình" button disappears; keep keyboard focus inside the card.
      cardHeadingRef.current?.focus();
    } catch (error) {
      toast.show({ tone: 'error', message: learningPathErrorMessage(error) });
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm capitalize text-muted">{todayLabel(timeZone)}</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          {status === 'loading' ? (
            <>
              <span className="sr-only">Đang tải…</span>
              <Skeleton className="h-8 w-52 align-middle" />
            </>
          ) : (
            `Chào ${name || 'bạn'}`
          )}
        </h1>
      </header>

      {status === 'error' && <ErrorState title="Không tải được hồ sơ" onRetry={reload} />}
      {paths.status === 'loading' && paths.paths.length === 0 && <Skeleton className="block h-64 w-full rounded-3xl" />}
      {paths.status === 'error' && <ErrorState title="Không tải được lộ trình" onRetry={paths.reload} />}
      {paths.status !== 'error' && paths.current && (
        <>
          {/* A paused path has no study session; its summary card offers to resume it. */}
          {paths.current.status === 'active' && <TodayCard key={paths.current.id} pathId={paths.current.id} />}
          <WeeklySummaryCard />
          <SpreadWarning paths={paths.paths} />
          <PathSummaryCard
            path={paths.current}
            timeZone={timeZone}
            onResume={() => void resume()}
            resuming={resuming}
            headingRef={cardHeadingRef}
          />
          <DiagnosticCard pathId={paths.current.id} />
          <ReviewDueCard />
          <NextLessonCard />
          <SpeakingCard />
          <HomeMotivation pathId={paths.current.id} />
        </>
      )}
    </div>
  );
}
