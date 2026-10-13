import { BookOpen, Check, ChevronRight, Clock, Compass } from 'lucide-react';
import { Link } from 'react-router';
import type { PathLesson, RunStatus } from '@linguo/shared';
import { DemoBadge } from '@/components/exercise';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { usePathLessons } from '@/features/lesson-player/usePathLessons';
import { cn } from '@/lib/cn';
import { groupPathLessons, pendingPrerequisiteTitles } from './grouping';

const STATUS: Record<RunStatus, { label: string; className: string }> = {
  not_started: { label: 'Chưa học', className: 'bg-text/8 text-muted' },
  in_progress: { label: 'Đang học', className: 'bg-primary/12 text-primary' },
  completed: { label: 'Đã xong', className: 'bg-success/15 text-success-text' },
};

function LoadingList() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Đang tải bài học…</span>
      <Skeleton className="block h-6 w-40" />
      <Skeleton className="block h-20 w-full rounded-2xl" />
      <Skeleton className="block h-20 w-full rounded-2xl" />
      <Skeleton className="block h-20 w-full rounded-2xl" />
    </div>
  );
}

function LessonRow({ lesson, lessons }: { lesson: PathLesson; lessons: PathLesson[] }) {
  const status = STATUS[lesson.run_status];
  const prerequisites = lesson.prerequisites_met ? [] : pendingPrerequisiteTitles(lesson, lessons);
  return (
    <Link
      to={`/app/hoc-tap/bai/${lesson.lesson_id}`}
      className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface-solid px-4 py-3 transition-colors hover:bg-text/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/45"
    >
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-semibold">{lesson.title.vi}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold', status.className)}>
            {lesson.run_status === 'completed' && <Check aria-hidden className="size-3.5" />}
            {status.label}
          </span>
          <span className="inline-flex items-center gap-1 text-muted">
            <Clock aria-hidden className="size-3.5" />
            {lesson.estimated_minutes} phút
          </span>
        </span>
        {!lesson.prerequisites_met && (
          <span className="block text-sm text-muted">
            {prerequisites.length > 0 ? `Nên học trước: ${prerequisites.join(', ')}` : 'Nên học các bài trước đó trước'}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
    </Link>
  );
}

/** /app/hoc-tap: programs → units → lessons of the current learning path. */
export function LearnPage() {
  const paths = useLearningPaths();
  const { status, lessons, error, reload } = usePathLessons();

  let content;
  if (!paths.current) {
    if (paths.status === 'loading') content = <LoadingList />;
    else if (paths.status === 'error') content = <ErrorState title="Không tải được lộ trình" onRetry={paths.reload} />;
    else {
      content = (
        <EmptyState
          icon={Compass}
          title="Bạn chưa có lộ trình"
          description="Tạo lộ trình để Linguo gợi ý bài học phù hợp với mục tiêu của bạn."
          action={
            <Link to="/app/bat-dau" className={buttonClasses('accent')}>
              Tạo lộ trình
            </Link>
          }
        />
      );
    }
  } else if (status === 'loading' && lessons.length === 0) {
    content = <LoadingList />;
  } else if (status === 'error') {
    content = <ErrorState title="Không tải được danh sách bài" description={error ?? undefined} onRetry={reload} />;
  } else if (lessons.length === 0) {
    content = (
      <EmptyState
        icon={BookOpen}
        title="Chưa có bài học phù hợp với lộ trình này"
        description="Nội dung cho trình độ của bạn đang được biên soạn. Hãy quay lại sau nhé."
      />
    );
  } else {
    content = (
      <div className="space-y-8">
        {groupPathLessons(lessons).map((program) => (
          <section key={program.id} aria-labelledby={`program-${program.id}`} className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`program-${program.id}`} className="text-xl font-bold tracking-[-0.02em]">
                {program.title}
              </h2>
              {program.isDemo && <DemoBadge />}
            </div>
            {program.units.map((unit) => (
              <section key={unit.id} aria-labelledby={`unit-${unit.id}`} className="space-y-2">
                <h3 id={`unit-${unit.id}`} className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {unit.title}
                </h3>
                <ul className="space-y-2">
                  {unit.lessons.map((lesson) => (
                    <li key={lesson.lesson_id}>
                      <LessonRow lesson={lesson} lessons={lessons} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Học tập</h1>
      {content}
    </div>
  );
}
