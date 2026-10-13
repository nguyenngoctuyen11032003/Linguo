import { useState } from 'react';
import { Navigate } from 'react-router';
import { DEFAULT_TIMEZONE } from '@linguo/shared';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { setPathStatus } from '@/features/learning-paths/service';
import { useProfile } from '@/features/profile/ProfileProvider';
import { requireSupabase } from '@/lib/supabase';
import { PathSummaryCard } from './home/PathSummaryCard';
import { SpreadWarning } from './home/SpreadWarning';

const todayLabel = () => new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

export function HomePage() {
  const { status, profile, reload } = useProfile();
  const paths = useLearningPaths();
  const toast = useToast();
  const [resuming, setResuming] = useState(false);
  const name = profile?.displayName.trim();

  if (paths.status === 'ready' && paths.paths.length === 0) return <Navigate to="/app/bat-dau" replace />;

  async function resume() {
    if (!paths.current) return;
    setResuming(true);
    try {
      paths.upsertPath(await setPathStatus(requireSupabase(), paths.current.id, 'active'));
    } catch (error) {
      toast.show({ tone: 'error', message: learningPathErrorMessage(error) });
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm capitalize text-muted">{todayLabel()}</p>
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
      {paths.status === 'loading' && <Skeleton className="block h-64 w-full rounded-3xl" />}
      {paths.status === 'error' && <ErrorState title="Không tải được lộ trình" onRetry={paths.reload} />}
      {paths.status === 'ready' && paths.current && (
        <>
          <SpreadWarning paths={paths.paths} />
          <PathSummaryCard
            path={paths.current}
            timeZone={profile?.timezone ?? DEFAULT_TIMEZONE}
            onResume={() => void resume()}
            resuming={resuming}
          />
        </>
      )}
    </div>
  );
}
