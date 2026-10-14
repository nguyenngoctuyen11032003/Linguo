import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { GOAL_LABELS, LANGUAGES, LEVEL_INFO, type LevelCode } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { EstimateSummary } from '@/features/learning-paths/components/EstimateSummary';
import { formatEstimate } from '@/features/learning-paths/format-estimate';
import type { LearningPath } from '@/features/learning-paths/service';

interface Props {
  path: LearningPath;
  onResume: () => void;
  resuming: boolean;
  /** Ref callback for the element to focus after the card changes state (resume swaps the full card for the compact row). */
  focusRef?: (node: HTMLElement | null) => void;
}

/**
 * Active path: a compact row that links to the path ("Học tập"), so the static summary never competes with today's
 * session. Paused path: the full card with the "Tiếp tục lộ trình" button.
 */
export function PathSummaryCard({ path, onResume, resuming, focusRef }: Props) {
  const from = LEVEL_INFO[path.currentLevel as LevelCode].label;
  const to = LEVEL_INFO[path.targetLevel as LevelCode].label;
  const { weeksMin, weeksMax } = path.estimate;
  const weeks = formatEstimate(weeksMin, weeksMax, { capitalize: true });
  const title = `${LANGUAGES[path.language].nameVi} · ${GOAL_LABELS[path.goalType]}`;

  if (path.status !== 'paused') {
    return (
      <Link
        ref={focusRef}
        to="/app/hoc-tap"
        className="flex min-h-14 items-center gap-3 rounded-3xl border border-border bg-surface-solid px-5 py-3 shadow-[var(--shadow-card)] transition-colors hover:bg-text/5"
      >
        <span className="min-w-0 flex-1 break-words">
          <span className="block text-sm text-muted">Lộ trình của bạn</span>
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-muted">
            <span className="sr-only">Từ trình độ hiện tại tới mục tiêu: </span>
            {from} → {to} · {weeks}
            {!path.estimate.assumptions.referenceReviewed && ' (ước lượng tham khảo)'}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
      </Link>
    );
  }

  return (
    <SolidCard className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">Lộ trình của bạn</p>
          <h2 ref={focusRef} tabIndex={-1} className="text-xl font-bold tracking-[-0.02em] focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/45">
            {title}
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-warn/15 px-3 py-1 text-sm font-semibold">Đang tạm dừng</span>
      </div>
      <p className="text-lg font-semibold">
        <span className="sr-only">Từ trình độ hiện tại tới mục tiêu: </span>
        {from} → {to}
      </p>
      <EstimateSummary estimate={path.estimate} compact />
      {!path.estimate.assumptions.referenceReviewed && (
        <p className="text-sm text-muted">Số giờ tham chiếu chưa được kiểm duyệt, ước lượng chỉ để tham khảo.</p>
      )}
      <Button variant="primary" size="lg" block loading={resuming} onClick={onResume}>
        Tiếp tục lộ trình
      </Button>
      <Link to="/app/cai-dat#lo-trinh" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
        Sửa kế hoạch
      </Link>
    </SolidCard>
  );
}
