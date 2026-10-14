import { useId } from 'react';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useExamHistory } from '@/features/exam/useExamHistory';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { ExamHistoryList } from './components';
import { EXAM_HUB_PATH } from './exam-page-utils';

export interface ExamHistoryCardProps {
  /** Path whose attempts to list; defaults to the current learning path. */
  pathId?: string | null;
  /** Rows shown (default 5). */
  limit?: number;
  headingLevel?: 'h2' | 'h3';
}

/**
 * "Thi thử gần đây" for the Tiến độ page (spec 9 §4, PRD 10.1): recent mock scores with date and mode, linking
 * to each result. Renders nothing without a path.
 */
export function ExamHistoryCard({ pathId, limit = 5, headingLevel = 'h2' }: ExamHistoryCardProps) {
  const paths = useLearningPaths();
  const id = pathId === undefined ? (paths.current?.id ?? null) : pathId;
  const history = useExamHistory(id, limit);
  const titleId = useId();
  const Heading = headingLevel;

  if (!id) return null;

  let body;
  if (history.status === 'error') {
    body = (
      <p role="alert" className="text-[15px] text-muted">
        Chưa tải được lịch sử thi.{' '}
        <button
          type="button"
          onClick={history.reload}
          className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
        >
          Tải lại lịch sử thi
        </button>
      </p>
    );
  } else if (history.status === 'ready') {
    body = <ExamHistoryList entries={history.entries} compact />;
  } else {
    body = (
      <div role="status" className="space-y-2">
        <span className="sr-only">Đang tải lịch sử thi…</span>
        <Skeleton className="block h-12 w-full rounded-2xl" />
        <Skeleton className="block h-12 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <SolidCard>
      <section aria-labelledby={titleId} className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <GraduationCap aria-hidden className="size-5" />
          </span>
          <Heading id={titleId} className="min-w-0 flex-1 text-lg font-bold tracking-[-0.02em]">
            Thi thử gần đây
          </Heading>
          <Link
            to={EXAM_HUB_PATH}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            Luyện thi
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        </div>
        {body}
        <p className="text-xs text-muted">Điểm bài luyện mô phỏng, quy đổi chỉ để tham khảo.</p>
      </section>
    </SolidCard>
  );
}
