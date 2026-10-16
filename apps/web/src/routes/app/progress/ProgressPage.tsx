import { useEffect, useId, useRef, type ReactNode } from 'react';
import { BarChart3, Compass, CloudOff } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import type { ProgressRange } from '@linguo/shared';
import { Button, buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { track } from '@/features/analytics';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { useProgressDashboard } from '@/features/progress/useProgressDashboard';
import { useReviewSummary } from '@/features/reviews/useReviewSummary';
import { cn } from '@/lib/cn';
import { useOnline } from '@/lib/useOnline';
import { ExamHistoryCard } from '@/routes/app/exam/ExamHistoryCard';
import { AccuracyList } from './AccuracyList';
import { ActivityChart } from './ActivityChart';
import { EstimatesCard } from './EstimatesCard';
import { HowCalculated } from './HowCalculated';
import { PROGRESS_TERMS, skillAccuracyRows, typeAccuracyRows } from './labels';
import { MistakesList } from './MistakesList';
import { MotivationPanel } from './MotivationPanel';
import { isEmptyDashboard, parseRange, RANGE_PARAM } from './page-logic';
import { RangeToggle } from './RangeToggle';
import { ReviewPlanButton } from './ReviewPlanButton';
import { TotalsGrid } from './TotalsGrid';
import { useBadgeToast } from './useBadgeToast';
import { PageHeader } from '../PageHeader';

function LoadingDashboard() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Đang tải tiến độ…</span>
      <Skeleton className="block h-[26rem] w-full rounded-[1.75rem]" />
      <Skeleton className="block h-80 w-full rounded-[1.75rem]" />
      <Skeleton className="block h-64 w-full rounded-[1.75rem]" />
    </div>
  );
}

function Layer({ title, intro, children, className }: { title: string; intro: string; children: ReactNode; className?: string }) {
  const headingId = useId();
  return (
    <SolidCard className={cn('p-5 max-[379px]:p-4 lg:p-6', className)}>
      <section aria-labelledby={headingId} className="space-y-4">
        <div>
          <h2 id={headingId} className="text-xl font-extrabold tracking-[-0.02em]">
            {title}
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">{intro}</p>
        </div>
        {children}
      </section>
    </SolidCard>
  );
}

/** /app/tien-do: activity, learning and competence kept apart (PRD 10.2), plus the switchable motivation layer. */
export function ProgressPage() {
  const paths = useLearningPaths();
  const pathId = paths.current?.id ?? null;
  const [params, setParams] = useSearchParams();
  const range = parseRange(params.get(RANGE_PARAM));
  const dashboard = useProgressDashboard(pathId, range);
  const review = useReviewSummary(pathId);
  const online = useOnline();
  const data = dashboard.data;
  useBadgeToast(pathId, data?.motivation);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track('progress_viewed', { range_days: range });
  }, [range]);

  const changeRange = (next: ProgressRange) => {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set(RANGE_PARAM, String(next));
        return out;
      },
      { replace: true },
    );
  };

  let content: ReactNode;
  if (!paths.current) {
    if (paths.status === 'loading') content = <LoadingDashboard />;
    else if (paths.status === 'error') content = <ErrorState title="Không tải được lộ trình" onRetry={paths.reload} />;
    else {
      content = (
        <EmptyState
          icon={Compass}
          title="Bạn chưa có lộ trình"
          description="Tạo lộ trình để Linguo theo dõi thời gian học, kết quả và trình độ của bạn."
          action={
            <Link to="/app/bat-dau" className={buttonClasses('accent')}>
              Tạo lộ trình
            </Link>
          }
        />
      );
    }
  } else if (dashboard.status === 'error') {
    content = online ? (
      <ErrorState title="Không tải được tiến độ" description={dashboard.error ?? undefined} onRetry={dashboard.reload} />
    ) : (
      <EmptyState
        icon={CloudOff}
        title="Bạn đang ngoại tuyến"
        description="Số liệu tiến độ được tính trên máy chủ. Kết nối mạng rồi thử lại."
        action={
          <Button variant="ghost" onClick={dashboard.reload}>
            Thử lại
          </Button>
        }
      />
    );
  } else if (!data) {
    content = <LoadingDashboard />;
  } else {
    const refreshing = dashboard.status === 'loading';
    const empty = isEmptyDashboard(data);
    const shownRange = data.range_days;
    const summary = review.summary;
    content = (
      <div aria-busy={refreshing || undefined} className={cn('reveal-stagger space-y-6 transition-opacity duration-200 lg:space-y-8', refreshing && 'opacity-70')}>
        {empty ? (
          <EmptyState
            icon={BarChart3}
            title={`Chưa có hoạt động trong ${shownRange} ngày qua`}
            description="Học một bài hoặc ôn vài thẻ, số phút học và độ chính xác sẽ hiện ở đây."
            action={
              <Link to="/app/hoc-tap" className={buttonClasses('accent')}>
                Đi tới bài học
              </Link>
            }
          />
        ) : (
          <TotalsGrid
            totals={data.totals}
            retention={{ value: summary?.retention_30d ?? null, sample: summary?.retention_sample ?? 0 }}
            masteredTotal={summary?.mastered_total ?? 0}
            rangeDays={shownRange}
          />
        )}
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:gap-8">
          <div className="min-w-0 space-y-6 xl:space-y-8">
            {!empty && (
              <>
                <Layer title="Hoạt động" intro={`Bạn đã học bao lâu trong ${shownRange} ngày qua, so với lịch học của lộ trình.`}>
                  <ActivityChart days={data.days} />
                </Layer>
                <Layer title={PROGRESS_TERMS.resultsSection} intro={`Độ chính xác ở lần trả lời đầu tiên, so với ${shownRange} ngày trước đó.`}>
                  <div className="grid gap-6 md:grid-cols-2">
                    <AccuracyList title="Theo kỹ năng" rows={skillAccuracyRows(data.skills)} rangeDays={shownRange} />
                    <AccuracyList title="Theo dạng bài" rows={typeAccuracyRows(data.exercise_types)} rangeDays={shownRange} />
                  </div>
                </Layer>
              </>
            )}
            <ExamHistoryCard pathId={pathId} />
          </div>
          <div className="min-w-0 space-y-6 xl:space-y-8">
            <EstimatesCard estimates={data.estimates} pathId={data.path_id} />
            {!empty && (
              <MistakesList
                mistakes={data.mistakes}
                action={
                  paths.current && <ReviewPlanButton dashboard={data} learner={{ language: paths.current.language, level: paths.current.currentLevel }} />
                }
              />
            )}
          </div>
        </div>
        {data.motivation && <MotivationPanel motivation={data.motivation} />}
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        title="Tiến độ"
        lede="Thời gian học, kết quả và trình độ ước lượng được tính riêng."
        actions={paths.current && <RangeToggle value={range} onChange={changeRange} />}
      />
      {content}
      {!data && <ExamHistoryCard pathId={pathId} />}
      <HowCalculated />
    </div>
  );
}
