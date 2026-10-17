import { useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, Clock, Compass, PartyPopper, Play, Route } from 'lucide-react';
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
import { playSound } from '@/lib/sound';
import { groupPathLessons, learnedCount, pendingPrerequisiteTitles, pickNextLesson, type UnitGroup } from './grouping';
import { useLessonUnavailable } from './offline-format';
import { DownloadControl, LessonOfflineTag, SavedListNotice } from './OfflineControls';
import '../home/home.css';
import { readUnitOpen, writeUnitOpen, type UnitOpenState } from './unit-open';

const STATUS_LABEL: Record<RunStatus, string> = {
  not_started: 'Chưa học',
  in_progress: 'Đang học',
  completed: 'Đã học',
};

function LoadingList() {
  return (
    // Same rhythm as the loaded list (hero, program heading + bar, collapsed units) so nothing jumps.
    <div role="status" className="space-y-8">
      <span className="sr-only">Đang tải bài học…</span>
      <Skeleton className="block h-[6.5rem] w-full rounded-[1.75rem]" />
      <div className="space-y-3">
        <div className="space-y-2.5">
          <Skeleton className="block h-7 w-56 max-w-full" />
          <Skeleton className="block h-2.5 w-full rounded-full" />
        </div>
        <Skeleton className="block h-20 w-full rounded-[1.75rem]" />
        <Skeleton className="block h-20 w-full rounded-[1.75rem]" />
        <Skeleton className="block h-20 w-full rounded-[1.75rem]" />
      </div>
    </div>
  );
}

function ProgressSummary({ label, done, total, big = false }: { label: string; done: number; total: number; big?: boolean }) {
  const pct = total ? (done / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done}/${total} bài đã học`}
        className={cn('flex-1 overflow-hidden rounded-full bg-text/10', big ? 'h-2.5' : 'h-1.5')}
      >
        <div
          className={cn('h-full rounded-full', done === total && total > 0 ? 'bg-success' : 'bg-gradient-to-r from-primary to-accent')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="shrink-0 text-[13px] font-semibold tabular-nums text-muted">
        <span className="sr-only">
          {done}/{total} bài đã học
        </span>
        <span aria-hidden="true">
          <span className="text-text">{done}</span>/{total}
        </span>
      </p>
    </div>
  );
}

/** Round lesson node on the path spine: check when learned, play for the recommended one, its number otherwise. */
function LessonNode({ lesson, index, isNext }: { lesson: PathLesson; index: number; isNext: boolean }) {
  const completed = lesson.run_status === 'completed';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative z-10 grid size-12 shrink-0 sm:size-14 place-items-center rounded-full text-lg font-extrabold transition-transform duration-150 group-active:translate-y-[3px]',
        completed && 'bg-success text-white shadow-[0_4px_0_color-mix(in_srgb,var(--success)_55%,black)]',
        !completed && isNext && 'press-accent bg-accent text-on-accent ring-[6px] ring-accent/20',
        !completed && !isNext && lesson.run_status === 'in_progress' && 'press-primary bg-primary text-on-primary',
        !completed && !isNext && lesson.run_status === 'not_started' && 'border-2 border-border bg-surface-solid text-muted',
      )}
    >
      {completed ? (
        <Check className="size-6" strokeWidth={3} />
      ) : isNext || lesson.run_status === 'in_progress' ? (
        <Play className="ml-0.5 size-6 fill-current" />
      ) : (
        <span className="stat-num text-[26px]">{index + 1}</span>
      )}
    </span>
  );
}

function LessonRow({ lesson, lessons, nextId, index }: { lesson: PathLesson; lessons: PathLesson[]; nextId: string | null; index: number }) {
  const isNext = lesson.lesson_id === nextId;
  const prerequisites = lesson.prerequisites_met ? [] : pendingPrerequisiteTitles(lesson, lessons);
  // Offline and never downloaded: the row stays visible (the learner sees what to download) but cannot be opened.
  const unavailable = useLessonUnavailable(lesson);
  const rowClass = cn(
    'group flex min-h-16 items-center gap-3 rounded-[1.25rem] py-2 pl-1 pr-2 sm:gap-4 sm:pr-3 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/45',
    unavailable ? 'opacity-60' : 'hover:bg-text/[0.04]',
    isNext && 'bg-accent/[0.07] ring-1 ring-accent/25 ring-inset',
  );
  return (
    <Link
      to={`/app/hoc-tap/bai/${lesson.lesson_id}`}
      aria-disabled={unavailable || undefined}
      tabIndex={unavailable ? -1 : undefined}
      onClick={(event) => {
        if (unavailable) event.preventDefault();
        else playSound('tap');
      }}
      className={rowClass}
    >
      <LessonNode lesson={lesson} index={index} isNext={isNext} />
      <span className="min-w-0 flex-1 space-y-1">
        <span className={cn('block font-semibold leading-snug', lesson.run_status === 'completed' && 'text-muted')}>{lesson.title.vi}</span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]">
          <span className="sr-only">{STATUS_LABEL[lesson.run_status]}</span>
          {isNext && (
            <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-on-accent">
              {lesson.run_status === 'in_progress' ? 'Học tiếp' : 'Bài tiếp theo'}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-muted">
            <Clock aria-hidden className="size-3.5" />
            {lesson.estimated_minutes} phút
          </span>
          <LessonOfflineTag lesson={lesson} />
        </span>
        {!lesson.prerequisites_met && (
          <span className="flex items-start gap-1.5 text-[13px] text-muted">
            <Route aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {prerequisites.length > 0 ? `Nên học trước: ${prerequisites.join(', ')}` : 'Nên học các bài trước đó trước'}
          </span>
        )}
      </span>
      {!unavailable && <ChevronRight aria-hidden className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />}
    </Link>
  );
}

const levelName = (code: string) => LEVEL_INFO[code as LevelCode]?.label ?? code;

/** Compact "which path am I on" line: language, current level → target level. */
function PathHeader({ language, current, target }: { language: string; current: string; target: string }) {
  const name = LANGUAGES[language as keyof typeof LANGUAGES]?.nameVi ?? language;
  return (
    <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
      <span className="rounded-full bg-text/6 px-3 py-1 text-text ring-1 ring-border ring-inset">{name}</span>
      {current === target ? (
        <span className="text-muted">Trình độ {levelName(current)}</span>
      ) : (
        <>
          <span aria-hidden className="rounded-full bg-accent/12 px-3 py-1 text-accent-text">
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
 * the lesson path sits below. Opening/closing is reported up so the page can remember it for the tab.
 */
function UnitSection({
  unit,
  index,
  lessons,
  nextId,
  open,
  onToggle,
}: {
  unit: UnitGroup;
  index: number;
  lessons: PathLesson[];
  nextId: string | null;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const done = learnedCount(unit.lessons);
  const complete = done === unit.lessons.length;
  return (
    <section aria-labelledby={`unit-${unit.id}`} className="card lift overflow-hidden p-0">
      <details
        open={open}
        onToggle={(event) => {
          const now = event.currentTarget.open;
          if (now !== open) onToggle(now);
        }}
        className="group"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary/45 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-2xl',
              complete ? 'bg-success/15 text-success-text' : 'bg-primary/12 text-primary',
            )}
          >
            {complete ? <Check className="size-5" strokeWidth={3} /> : <span className="stat-num text-[24px]">{String(index + 1).padStart(2, '0')}</span>}
          </span>
          <span className="min-w-0 flex-1 space-y-1.5">
            <h3 id={`unit-${unit.id}`} className="text-[15px] font-bold leading-snug">
              {unit.title}
            </h3>
            <ProgressSummary label={`Tiến độ ${unit.title}`} done={done} total={unit.lessons.length} />
          </span>
          <ChevronDown aria-hidden className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        {/* The path spine runs through the centre of the lesson nodes. */}
        <div className="px-4 pb-3">
          <DownloadControl scope={`unit:${unit.id}`} kind="unit" lessons={unit.lessons} label="Tải về học offline" compact />
        </div>
        <ul className="relative space-y-1 px-2.5 pb-3 sm:px-3 before:absolute before:bottom-8 before:left-[calc(2.5rem-1px)] sm:before:left-[calc(2.75rem-1px)] before:top-6 before:w-0.5 before:rounded-full before:bg-border">
          {unit.lessons.map((lesson, i) => (
            <li key={lesson.lesson_id}>
              <LessonRow lesson={lesson} lessons={lessons} nextId={nextId} index={i} />
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
  const { status, lessons, error, reload, fromCache } = usePathLessons();
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
      <div className="stagger-in space-y-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-10 lg:space-y-0 *:min-w-0">
        <aside className="lg:sticky lg:top-24 lg:col-span-4 lg:col-start-9 lg:row-start-1">
        {next ? (
          <Link
            to={`/app/hoc-tap/bai/${next.lesson_id}`}
            aria-label={`${next.run_status === 'in_progress' ? 'Học tiếp' : 'Bắt đầu'}: ${next.title.vi}`}
            onClick={() => playSound('tap')}
            className="group relative isolate flex items-center gap-4 overflow-hidden rounded-[1.75rem] bg-[image:var(--hero-bg)] p-4 pl-5 text-white transition-transform duration-500 ease-[var(--ease-expo)] hover:-translate-y-0.5 lg:min-h-56 lg:flex-col-reverse lg:items-stretch lg:justify-between lg:gap-8 lg:rounded-[2rem] lg:p-7 shadow-[0_20px_50px_-24px_rgb(7_11_18/0.8)] ring-1 ring-white/10 ring-inset focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/60"
          >
            <span aria-hidden="true" className="absolute -right-10 -top-16 -z-10 size-48 rounded-full bg-radial from-accent/35 to-transparent to-70%" />
            <span className="min-w-0 flex-1 break-words">
              <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-white/65">
                {next.run_status === 'in_progress' ? 'Tiếp tục' : 'Bắt đầu'}
              </span>
              <span className="mt-1 block text-[19px] font-bold leading-snug lg:mt-2 lg:text-[26px] lg:tracking-[-0.02em]">{next.title.vi}</span>
              <span className="mt-1 flex items-center gap-1 text-[13px] text-white/65">
                <Clock aria-hidden className="size-3.5" />
                {next.estimated_minutes} phút
              </span>
            </span>
            <span
              aria-hidden="true"
              className="press-accent grid size-14 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-transform group-active:translate-y-[3px] lg:size-16 lg:self-end"
            >
              <ArrowRight className="size-6 transition-transform duration-300 group-hover:translate-x-0.5" />
            </span>
          </Link>
        ) : (
          <p className="card flex items-start gap-3 p-4">
            <PartyPopper aria-hidden className="mt-0.5 size-5 shrink-0 text-success-text" />
            <span>Bạn đã hoàn thành các bài hiện có. Nội dung mới sẽ sớm được bổ sung nhé!</span>
          </p>
        )}
        </aside>
        <div className="space-y-10 lg:col-span-8 lg:col-start-1 lg:row-start-1">
        <SavedListNotice fromCache={fromCache} />
        <DownloadControl scope="path" kind="path" lessons={lessons} label="Tải cả lộ trình" />
        {groupPathLessons(lessons).map((program) => (
          <section key={program.id} aria-labelledby={`program-${program.id}`} className="space-y-4">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={`program-${program.id}`} className="text-xl font-extrabold tracking-[-0.02em]">
                  {program.title}
                </h2>
                {program.isDemo && <DemoBadge />}
              </div>
              <ProgressSummary
                big
                label={`Tiến độ ${program.title}`}
                done={learnedCount(program.units.flatMap((u) => u.lessons))}
                total={program.units.reduce((n, u) => n + u.lessons.length, 0)}
              />
            </div>
            <ol className="route">
            {program.units.map((unit, i) => (
              <li
                key={unit.id}
                data-state={learnedCount(unit.lessons) === unit.lessons.length ? 'done' : next?.unit_id === unit.id ? 'next' : 'todo'}
              >
              <UnitSection
                unit={unit}
                index={i}
                lessons={lessons}
                nextId={next?.lesson_id ?? null}
                open={openUnits[unit.id] ?? next?.unit_id === unit.id}
                onToggle={(open) => toggleUnit(unit.id, open)}
              />
              </li>
            ))}
            </ol>
          </section>
        ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="page-title lg:!text-[3rem]">Học tập</h1>
        {paths.current ? (
          <PathHeader language={paths.current.language} current={paths.current.currentLevel} target={paths.current.targetLevel} />
        ) : (
          paths.status === 'loading' && <Skeleton className="block h-[22px] w-44 rounded-full" />
        )}
      </div>
      {content}
    </div>
  );
}
