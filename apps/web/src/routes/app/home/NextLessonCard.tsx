import { Clock, Play } from 'lucide-react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { usePathLessons } from '@/features/lesson-player/usePathLessons';
import { pickNextLesson } from '../learn/grouping';

/** Home "Bài tiếp theo": a skeleton holds its place while loading; hidden when nothing is available; a load error leaves only a small retry. */
export function NextLessonCard() {
  const { status, lessons, reload } = usePathLessons();

  if (status === 'error') {
    return (
      <p className="text-sm text-muted">
        Chưa tải được bài học tiếp theo.{' '}
        <button
          type="button"
          onClick={reload}
          className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
        >
          Tải lại bài tiếp theo
        </button>
      </p>
    );
  }
  if (status === 'loading' && lessons.length === 0) {
    // Hold the card's place so the cards below do not jump when the lesson arrives.
    return (
      <SolidCard className="min-h-35 p-4">
        <div role="status" className="flex items-center gap-4">
          <span className="sr-only">Đang tải bài tiếp theo…</span>
          <Skeleton className="block size-16 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 space-y-2">
            <Skeleton className="block h-3 w-24" />
            <Skeleton className="block h-6 w-40 max-w-full" />
            <Skeleton className="block h-5 w-32 max-w-full rounded-full" />
          </span>
        </div>
      </SolidCard>
    );
  }
  const lesson = pickNextLesson(lessons);
  if (!lesson) return null;

  const resuming = lesson.run_status === 'in_progress';
  return (
    <SolidCard className="group relative p-4 transition-colors focus-within:ring-4 focus-within:ring-primary/40 hover:border-primary/40">
      <section aria-labelledby="next-lesson-title" className="flex items-center gap-4">
        {/* Duolingo-style lesson node. */}
        <span
          aria-hidden="true"
          className="relative grid size-16 shrink-0 place-items-center rounded-full border-2 border-primary/60 bg-primary/12 text-primary transition-transform group-active:scale-95"
        >
          <span className="absolute -inset-2 rounded-full border border-dashed border-primary/35" />
          <Play className="ml-0.5 size-7 fill-current" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Bài tiếp theo</p>
          <h2 id="next-lesson-title" className="mt-0.5 text-[19px] font-bold leading-snug tracking-[-0.02em]">
            {lesson.title.vi}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1 rounded-full bg-text/6 px-2 py-0.5 font-semibold text-text/80">
              <Clock aria-hidden className="size-3.5" />
              <span>Khoảng {lesson.estimated_minutes} phút</span>
            </span>
            <span className="min-w-0 truncate">{lesson.unit_title.vi}</span>
          </p>
        </div>
        {/* The whole card is the target; the link's own text stays for screen readers. */}
        <Link
          to={`/app/hoc-tap/bai/${lesson.lesson_id}`}
          className="absolute inset-0 rounded-[inherit] focus-visible:outline-none"
        >
          <span className="sr-only">{resuming ? 'Tiếp tục bài này' : 'Học bài này'}</span>
        </Link>
      </section>
    </SolidCard>
  );
}
