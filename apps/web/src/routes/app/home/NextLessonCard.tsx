import { Clock } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';
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
      <SolidCard className="min-h-48">
        <div role="status" className="space-y-3">
          <span className="sr-only">Đang tải bài tiếp theo…</span>
          <Skeleton className="block h-4 w-24" />
          <Skeleton className="block h-6 w-56 max-w-full" />
          <Skeleton className="block h-4 w-44 max-w-full" />
          <Skeleton className="block h-13 w-full rounded-full" />
        </div>
      </SolidCard>
    );
  }
  const lesson = pickNextLesson(lessons);
  if (!lesson) return null;

  const resuming = lesson.run_status === 'in_progress';
  return (
    <SolidCard className="space-y-4">
      <section aria-labelledby="next-lesson-title" className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-muted">Bài tiếp theo</p>
          <h2 id="next-lesson-title" className="text-xl font-bold tracking-[-0.02em]">
            {lesson.title.vi}
          </h2>
          <p className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Clock aria-hidden className="size-4" />
            <span>Khoảng {lesson.estimated_minutes} phút</span>
            <span aria-hidden="true">·</span>
            <span>{lesson.unit_title.vi}</span>
          </p>
        </div>
        <Link to={`/app/hoc-tap/bai/${lesson.lesson_id}`} className={buttonClasses('ghost', 'lg', true)}>
          {resuming ? 'Tiếp tục bài này' : 'Học bài này'}
        </Link>
      </section>
    </SolidCard>
  );
}
