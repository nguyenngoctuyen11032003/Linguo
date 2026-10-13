import { AlertTriangle, CheckCircle2, CircleDashed, Info, PenLine, TimerOff } from 'lucide-react';
import type { ExamResult } from '@linguo/shared';
import { SolidCard } from '@/components/ui/SolidCard';
import {
  ESTIMATE_LABEL,
  FAMILY_LABELS,
  MODE_LABELS,
  SECTION_LABELS,
  UNVERIFIED_SCORING_LABEL,
  formatDate,
  formatScore,
  levelLabel,
} from './labels';
import { SimulatedBadge } from './SimulatedBadge';

export interface ResultSummaryProps {
  result: ExamResult;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Total and per-section scores, the TOPIK estimate or CEFR "đạt mức" lines, and every disclaimer. */
export function ResultSummary({ result }: ResultSummaryProps) {
  const hasEssay = result.review.some((r) => r.kind === 'essay');
  const isCefr = result.family === 'cefr';
  const cefrSections = isCefr ? (result.cefr_sections ?? []) : [];

  return (
    <SolidCard className="min-w-0 space-y-5">
      <div className="space-y-2">
        <SimulatedBadge />
        <h2 className="text-xl font-bold leading-snug break-words">{result.form_title_vi}</h2>
        <p className="text-sm text-muted">
          {FAMILY_LABELS[result.family]} · {MODE_LABELS[result.mode]} · {formatDate(result.submitted_at)}
        </p>
        {result.status === 'expired' && (
          <p className="flex items-start gap-2 text-sm font-medium">
            <TimerOff aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
            <span className="min-w-0">Hết giờ — bài đã được nộp tự động với các câu đã lưu.</span>
          </p>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-muted">Tổng điểm</p>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-4xl font-extrabold tabular-nums">{`${formatScore(result.total)}/${formatScore(result.max)}`}</span>
          <span className="text-sm text-muted">điểm chấm tự động ({pct(result.total, result.max)}%)</span>
        </p>
        {hasEssay && (
          <p className="mt-1 flex items-start gap-2 text-sm text-muted">
            <PenLine aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">Bài viết luận chưa được chấm điểm tự động — tự đánh giá theo tiêu chí ở phần xem lại.</span>
          </p>
        )}
      </div>

      <ul aria-label="Điểm theo phần" className="grid gap-3">
        {result.by_section.map((s) => (
          <li key={s.section} className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold">{SECTION_LABELS[s.section]}</span>
              <span className="text-sm tabular-nums">
                {formatScore(s.points)}/{formatScore(s.max)} điểm · {s.correct}/{s.total} câu đúng
                {!isCefr && s.scaled !== null && <span className="text-muted"> · Quy đổi: {formatScore(s.scaled)}</span>}
              </span>
            </div>
            <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-text/10">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct(s.points, s.max)}%` }} />
            </div>
          </li>
        ))}
      </ul>

      {!isCefr && result.estimated_level && (
        <div className="rounded-2xl border border-border bg-bg/60 px-4 py-3">
          <p className="text-lg font-bold">Bậc ước lượng: {result.estimated_level.label_vi}</p>
          <p className="text-sm text-muted">Tổng quy đổi: {formatScore(result.estimated_level.scaled_total)}</p>
          <EstimateNote />
        </div>
      )}

      {cefrSections.length > 0 && (
        <div className="rounded-2xl border border-border bg-bg/60 px-4 py-3">
          <ul className="space-y-1.5">
            {cefrSections.map((c) => (
              <li key={c.section} className="flex items-start gap-2 font-medium">
                {c.reached ? (
                  <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success-text" />
                ) : (
                  <CircleDashed aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
                )}
                <span className="min-w-0">
                  {`${c.reached ? 'Đạt' : 'Chưa đạt'} mức ${levelLabel(c.level_code)} ở phần ${SECTION_LABELS[c.section]} (ước lượng)`}
                </span>
              </li>
            ))}
          </ul>
          <EstimateNote />
        </div>
      )}

      <div className="space-y-1 text-sm">
        {!result.scoring_verified && (
          <p className="flex items-start gap-2 font-semibold text-text">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
            <span className="min-w-0">{UNVERIFIED_SCORING_LABEL}</span>
          </p>
        )}
        <p className="text-muted break-words">Nguồn thang điểm: {result.scoring_source_vi}</p>
      </div>
    </SolidCard>
  );
}

function EstimateNote() {
  return (
    <p className="mt-2 flex items-start gap-2 text-sm text-muted">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{ESTIMATE_LABEL}</span>
    </p>
  );
}
