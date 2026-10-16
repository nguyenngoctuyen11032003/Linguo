import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { GOAL_LABELS, LANGUAGES, LEVEL_INFO, type LevelCode } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { EstimateSummary } from '@/features/learning-paths/components/EstimateSummary';
import { formatEstimate } from '@/features/learning-paths/format-estimate';
import type { LearningPath } from '@/features/learning-paths/service';

const SHORT_LEVEL: Record<string, string> = { pre_a1: 'A0', hangul: '가', kana: 'あ' };

/** Two-to-three character level tag for the big readout (A2, T3, N4…). */
function shortLevel(code: string): string {
  return SHORT_LEVEL[code] ?? code.replace(/^topik/, 'T').toUpperCase();
}

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
        className="card grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3.5 transition-[border-color,scale] duration-150 hover:border-primary/40 active:scale-[0.99] min-[380px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[380px]:gap-x-4"
      >
        <span aria-hidden="true" className="stat-num flex shrink-0 items-center gap-1.5 text-[26px] max-[379px]:col-start-1 max-[379px]:row-start-1 min-[380px]:text-[28px]">
          <span className="text-muted">{shortLevel(path.currentLevel)}</span>
          <span className="h-0.5 w-4 rounded-full bg-gradient-to-r from-muted to-accent" />
          <span className="text-accent-text">{shortLevel(path.targetLevel)}</span>
        </span>
        <span className="min-w-0 break-words max-[379px]:col-start-1 max-[379px]:row-start-2 min-[380px]:border-l min-[380px]:border-border min-[380px]:pl-4">
          <span className="eyebrow block">Lộ trình của bạn</span>
          <span className="block text-[15px] font-bold leading-snug">{title}</span>
          <span className="block text-[13px] text-muted">
            <span className="sr-only">Từ trình độ hiện tại tới mục tiêu: </span>
            <span className="sr-only">
              {from} → {to} ·{' '}
            </span>
            {weeks}
            {!path.estimate.assumptions.referenceReviewed && ' (ước lượng tham khảo)'}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted max-[379px]:col-start-2 max-[379px]:row-span-2 max-[379px]:row-start-1" />
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
