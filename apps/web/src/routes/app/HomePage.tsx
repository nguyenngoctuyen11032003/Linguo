import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { DEFAULT_TIMEZONE } from '@linguo/shared';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { setPathStatus } from '@/features/learning-paths/service';
import { avatarUrl } from '@/features/profile/avatar';
import { useProfile } from '@/features/profile/ProfileProvider';
import { resolveTimeZone } from '@/lib/dates';
import { getSupabase, requireSupabase } from '@/lib/supabase';
import { ClassesHomeCard } from '@/features/classes/ClassesHomeCard';
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
  const cardFocusRef = useRef<HTMLElement | null>(null);
  const setCardFocus = useCallback((node: HTMLElement | null) => {
    cardFocusRef.current = node;
  }, []);
  const [focusAfterResume, setFocusAfterResume] = useState(false);
  const fullName = profile?.displayName.trim();
  // Vietnamese names end with the given name: greet by it only ("Nguyễn Ngọc Tuyền" → "Tuyền").
  const name = fullName?.split(/\s+/).pop();
  const timeZone = resolveTimeZone(profile?.timezone ?? DEFAULT_TIMEZONE);

  const currentStatus = paths.current?.status;
  useEffect(() => {
    // Resuming swaps the full paused card for the compact row: keep keyboard focus on it.
    if (focusAfterResume && currentStatus === 'active') {
      cardFocusRef.current?.focus();
      setFocusAfterResume(false);
    }
  }, [focusAfterResume, currentStatus]);

  if (paths.status === 'ready' && paths.paths.length === 0) return <Navigate to="/app/bat-dau" replace />;

  async function resume() {
    if (!paths.current) return;
    setResuming(true);
    try {
      paths.upsertPath(await setPathStatus(requireSupabase(), paths.current.id, 'active'));
      toast.show({ tone: 'success', message: 'Đã tiếp tục lộ trình.' });
      // The "Tiếp tục lộ trình" button disappears; keep keyboard focus inside the card.
      cardFocusRef.current?.focus();
      setFocusAfterResume(true);
    } catch (error) {
      toast.show({ tone: 'error', message: learningPathErrorMessage(error) });
    } finally {
      setResuming(false);
    }
  }

  const pathSummary = paths.current && (
    <PathSummaryCard path={paths.current} onResume={() => void resume()} resuming={resuming} focusRef={setCardFocus} />
  );

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3.5 pb-2">
        <Avatar
          src={avatarUrl(getSupabase(), profile?.avatarPath)}
          initial={(name || '?').charAt(0).toUpperCase()}
          className="size-14"
          initialClassName="stat-num text-[26px]"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="eyebrow truncate">{todayLabel(timeZone)}</p>
          <h1 className="page-title truncate !text-[clamp(1.75rem,8.5vw,2.25rem)] !leading-[1.15]">
            {status === 'loading' ? (
              <>
                <span className="sr-only">Đang tải…</span>
                <Skeleton className="block h-[1.04em] w-44 max-w-full rounded-2xl" />
              </>
            ) : (
              `Chào ${name || 'bạn'}`
            )}
          </h1>
        </div>
      </header>

      {status === 'error' && <ErrorState title="Không tải được hồ sơ" onRetry={reload} />}
      {paths.status === 'loading' && paths.paths.length === 0 && <Skeleton className="block h-64 w-full rounded-3xl" />}
      {paths.status === 'error' && <ErrorState title="Không tải được lộ trình" onRetry={paths.reload} />}
      {paths.status !== 'error' && paths.current && (
        <>
          {/* A paused path has no study session; its summary card offers to resume it. */}
          {paths.current.status === 'active' ? <TodayCard key={paths.current.id} pathId={paths.current.id} /> : pathSummary}
          {/* One filled primary button on screen (Hôm nay); time-sensitive reviews follow it, the placement-test pitch comes last. */}
          <ReviewDueCard />
          <NextLessonCard />
          <WeeklySummaryCard />
          <SpreadWarning paths={paths.paths} />
          {paths.current.status === 'active' && pathSummary}
          {/* The placement test arrives after a request and may stay hidden, so it takes its own full row: the two
              static shortcuts below never change width when it appears (no layout shift, no lone tall tile). */}
          <DiagnosticCard pathId={paths.current.id} />
          <div className="grid grid-cols-2 gap-3 *:min-w-0 max-[379px]:grid-cols-1 sm:grid-cols-1">
            <SpeakingCard />
            <ClassesHomeCard />
          </div>
          <HomeMotivation pathId={paths.current.id} />
        </>
      )}
    </div>
  );
}
