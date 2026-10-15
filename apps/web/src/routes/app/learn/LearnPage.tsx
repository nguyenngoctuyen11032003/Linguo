import { useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, CircleDot, Clock, Compass, PartyPopper, Route } from 'lucide-react';
import { Link } from 'react-router';
import { LANGUAGES, LEVEL_INFO, type LevelCode, type PathLesson, type RunStatus } from '@linguo/shared';
import { DemoBadge } from '@/components/exercise';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { usePathLessons } from '@/features/lesson-player/usePathLessons';
import { cn } from '@/lib/cn';
import { groupPathLessons, learnedCount, pendingPrerequisiteTitles, pickNextLesson, type UnitGroup } from './grouping';
import { readUnitOpen, writeUnitOpen, type UnitOpenState } from './unit-open';

const STATUS: Record<RunStatus, { label: string; className: string }> = {
  not_started: { label: 'Chưa học', className: 'bg-text/8 text-muted' },
  in_progress: { label: 'Đang học', className: 'bg-primary/12 text-primary' },
  completed: { label: 'Đã học', className: 'bg-success/15 text-success-text' },
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

function ProgressSummary({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted">
        {done}/{total} bài đã học
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done}/${total} bài đã học`}
        className="h-2 overflow-hidden rounded-full bg-text/10"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

function LessonRow({ lesson, lessons, nextId }: { lesson: PathLesson; lessons: PathLesson[]; nextId: string | null }) {
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
            {lesson.run_status === 'in_progress' && <CircleDot aria-hidden className="size-3.5" />}
            {status.label}
          </span>
          {lesson.lesson_id === nextId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 font-semibold text-on-accent">
              {lesson.run_status === 'in_progress' ? 'Học tiếp' : 'Bài tiếp theo'}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-muted">
            <Clock aria-hidden className="size-3.5" />
            {lesson.estimated_minutes} phút
          </span>
        </span>
        {!lesson.prerequisites_met && (
          <span className="flex items-start gap-1.5 text-sm text-muted">
            <Route aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {prerequisites.length > 0 ? `Nên học trước: ${prerequisites.join(', ')}` : 'Nên học các bài trước đó trước'}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
    </Link>
  );
}

const levelName = (code: string) => LEVEL_INFO[code as LevelCode]?.label ?? code;

/** Compact "which path am I on" line: language, current level → target level. */
function PathHeader({ language, current, target }: { language: string; current: string; target: string }) {
  const name = LANGUAGES[language as keyof typeof LANGUAGES]?.nameVi ?? language;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted">
      <span className="font-semibold text-text">{name}</span>
      <span aria-hidden>·</span>
      {current === target ? (
        <span>Trình độ {levelName(current)}</span>
      ) : (
        <>
          <span aria-hidden>
            {levelName(current)} → {levelName(target)}
          </span>
          <span className="sr-only">
            trình độ hiện tại {levelName(current)}, mục tiêu {levelName(target)}
          </span>
        </>
      )}
    </p>
  );
}

/**
 * One unit as a native disclosure: the summary keeps the title and progress visible while collapsed and
 * the lesson list sits below. Opening/closing is reported up so the page can remember it for the tab.
 */
function UnitSection({
  unit,
  lessons,
  nextId,
  open,
  onToggle,
}: {
  unit: UnitGroup;
  lessons: PathLesson[];
  nextId: string | null;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const done = learnedCount(unit.lessons);
  const complete = done === unit.lessons.length;
  return (
    <section aria-labelledby={`unit-${unit.id}`}>
      <details
        open={open}
        onToggle={(event) => {
          const now = event.currentTarget.open;
          if (now !== open) onToggle(now);
        }}
        className="group"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-2xl py-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/45 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 space-y-2">
            <span className="flex items-center gap-1.5">
              {complete && <Check aria-hidden className="size-4 shrink-0 text-success-text" />}
              <h3 id={`unit-${unit.id}`} className="text-sm font-semibold uppercase tracking-wide text-muted">
                {unit.title}
              </h3>
            </span>
            <ProgressSummary label={`Tiến độ ${unit.title}`} done={done} total={unit.lessons.length} />
          </span>
          <ChevronDown aria-hidden className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-2 space-y-2">
          {unit.lessons.map((lesson) => (
            <li key={lesson.lesson_id}>
              <LessonRow lesson={lesson} lessons={lessons} nextId={nextId} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** /app/hoc-tap: programs → units → lessons of the current learning path. */
export function LearnPage() {
  const paths = useLearningPaths();
  const { status, lessons, error, reload } = usePathLessons();
  // Units the learner opened/closed in this tab; the others follow the default (open = holds the recommended lesson).
  const [openUnits, setOpenUnits] = useState<UnitOpenState>(readUnitOpen);
  const toggleUnit = (id: string, open: boolean) =>
    setOpenUnits((prev) => {
      const next = { ...prev, [id]: open };
      writeUnitOpen(next);
      return next;
    });

  const next = pickNextLesson(lessons);
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
        {next ? (
          <Link
            to={`/app/hoc-tap/bai/${next.lesson_id}`}
            className={cn(buttonClasses('accent'), 'h-auto min-h-12 w-full justify-between gap-3 py-3 text-left')}
          >
            <span className="min-w-0 break-words">
              {next.run_status === 'in_progress' ? 'Học tiếp' : 'Bắt đầu'}: {next.title.vi}
            </span>
            <ArrowRight aria-hidden className="size-5 shrink-0" />
          </Link>
        ) : (
          <p className="flex items-start gap-2 rounded-2xl border border-border bg-surface-solid px-4 py-3">
            <PartyPopper aria-hidden className="mt-0.5 size-5 shrink-0 text-success-text" />
            <span>Bạn đã hoàn thành các bài hiện có. Nội dung mới sẽ sớm được bổ sung nhé!</span>
          </p>
        )}
        {groupPathLessons(lessons).map((program) => (
          <section key={program.id} aria-labelledby={`program-${program.id}`} className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`program-${program.id}`} className="text-xl font-bold tracking-[-0.02em]">
                {program.title}
              </h2>
              {program.isDemo && <DemoBadge />}
            </div>
            <ProgressSummary
              label={`Tiến độ ${program.title}`}
              done={learnedCount(program.units.flatMap((u) => u.lessons))}
              total={program.units.reduce((n, u) => n + u.lessons.length, 0)}
            />
            {program.units.map((unit) => (
              <UnitSection
                key={unit.id}
                unit={unit}
                lessons={lessons}
                nextId={next?.lesson_id ?? null}
                open={openUnits[unit.id] ?? next?.unit_id === unit.id}
                onToggle={(open) => toggleUnit(unit.id, open)}
              />
            ))}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Học tập</h1>
        {paths.current && (
          <PathHeader language={paths.current.language} current={paths.current.currentLevel} target={paths.current.targetLevel} />
        )}
      </div>
      {content}
    </div>
  );
}
