import { AlertTriangle, CheckCircle2, CircleDashed, Info, PenLine, TimerOff } from 'lucide-react';
import type { ExamResult } from '@linguo/shared';
import { SolidCard } from '@/components/ui/SolidCard';
import { cn } from '@/lib/cn';
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

/** Bar colour by share of points: strong, middling, weak. */
const barTone = (percent: number) =>
  percent >= 70 ? 'from-success to-[#7ee2ae]' : percent >= 40 ? 'from-primary-strong to-primary' : 'from-accent-depth to-accent';

/** Ring around the percentage in the hero. */
function PercentRing({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <span aria-hidden="true" className="relative inline-flex size-[84px] shrink-0 items-center justify-center">
      <svg viewBox="0 0 80 80" className="absolute inset-0 size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="url(#exam-ring)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
        />
        <defs>
          <linearGradient id="exam-ring" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="#ffc06b" />
          </linearGradient>
        </defs>
      </svg>
      <span className="stat-num text-[26px]">
        {value}
        <span className="text-[15px]">%</span>
      </span>
    </span>
  );
}

/** Total and per-section scores, the TOPIK estimate or CEFR "đạt mức" lines, and every disclaimer. */
export function ResultSummary({ result }: ResultSummaryProps) {
  const hasEssay = result.review.some((r) => r.kind === 'essay');
  const isCefr = result.family === 'cefr';
  const cefrSections = isCefr ? (result.cefr_sections ?? []) : [];
  const percent = pct(result.total, result.max);

  return (
    <div className="min-w-0 space-y-4">
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-[image:var(--hero-bg)] p-5 text-white shadow-[0_24px_60px_-24px_rgb(7_11_18/0.8)] ring-1 ring-white/10 ring-inset">
        <div aria-hidden="true" className="absolute -bottom-24 -left-16 -z-10 size-64 rounded-full bg-accent/30 blur-3xl" />
        <div aria-hidden="true" className="absolute -right-10 -top-16 -z-10 size-48 rounded-full bg-primary/30 blur-3xl" />
        <SimulatedBadge onDark />
        <h2 className="mt-3 text-[19px] font-bold leading-snug tracking-[-0.01em] break-words">{result.form_title_vi}</h2>
        <p className="mt-0.5 text-[13px] text-white/70">
          {FAMILY_LABELS[result.family]} · {MODE_LABELS[result.mode]} · {formatDate(result.submitted_at)}
        </p>
        {result.status === 'expired' && (
          <p className="mt-2 flex items-start gap-2 text-[13px] font-medium text-white/85">
            <TimerOff aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">Hết giờ — bài đã được nộp tự động với các câu đã lưu.</span>
          </p>
        )}

        <div className="mt-5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Tổng điểm</p>
            <p className="sr-only">{`${formatScore(result.total)}/${formatScore(result.max)}`}</p>
            <p aria-hidden="true" className="mt-2 flex items-end gap-2">
              <span className="stat-num bg-gradient-to-b from-white to-white/55 bg-clip-text pr-1 text-[clamp(72px,24vw,104px)] text-transparent">
                {formatScore(result.total)}
              </span>
              <span className="pb-2 text-[15px] font-semibold leading-tight text-white/70">
                /{formatScore(result.max)}
                <br />
                điểm
              </span>
            </p>
          </div>
          <PercentRing value={percent} />
        </div>
        <p className="mt-3 text-[13px] text-white/70">điểm chấm tự động ({percent}%)</p>
        {hasEssay && (
          <p className="mt-2 flex items-start gap-2 text-[13px] text-white/75">
            <PenLine aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">Bài viết luận chưa được chấm điểm tự động — tự đánh giá theo tiêu chí ở phần xem lại.</span>
          </p>
        )}
      </section>

      <SolidCard className="min-w-0 space-y-5">
        <ul aria-label="Điểm theo phần" className="grid gap-4">
          {result.by_section.map((s) => {
            const p = pct(s.points, s.max);
            return (
              <li key={s.section} className="min-w-0">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <span className="eyebrow block text-text">{SECTION_LABELS[s.section]}</span>
                    <span className="mt-1 block text-[13px] text-muted tabular-nums">
                      {formatScore(s.points)}/{formatScore(s.max)} điểm · {s.correct}/{s.total} câu đúng
                      {!isCefr && s.scaled !== null && <span> · Quy đổi: {formatScore(s.scaled)}</span>}
                    </span>
                  </div>
                  <span aria-hidden="true" className="stat-num shrink-0 text-[36px]">
                    {p}
                    <span className="text-[18px] text-muted">%</span>
                  </span>
                </div>
                <div aria-hidden="true" className="mt-2 h-2.5 overflow-hidden rounded-full bg-text/8">
                  <div
                    className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-[var(--ease-expo)]', barTone(p))}
                    style={{ width: `${p}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        {!isCefr && result.estimated_level && (
          <div className="rounded-2xl bg-gold/10 px-4 py-3 ring-1 ring-gold/30 ring-inset">
            <p className="font-display text-[26px] font-extrabold uppercase leading-none">Bậc ước lượng: {result.estimated_level.label_vi}</p>
            <p className="mt-1.5 text-sm text-muted">Tổng quy đổi: {formatScore(result.estimated_level.scaled_total)}</p>
            <EstimateNote />
          </div>
        )}

        {cefrSections.length > 0 && (
          <div className="rounded-2xl bg-text/[0.04] px-4 py-3 ring-1 ring-border ring-inset">
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

        <div className="space-y-1 border-t border-border pt-4 text-[13px]">
          {!result.scoring_verified && (
            <p className="flex items-start gap-2 font-semibold text-text">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
              <span className="min-w-0">{UNVERIFIED_SCORING_LABEL}</span>
            </p>
          )}
          <p className="text-muted break-words">Nguồn thang điểm: {result.scoring_source_vi}</p>
        </div>
      </SolidCard>
    </div>
  );
}

function EstimateNote() {
  return (
    <p className="mt-2 flex items-start gap-2 text-[13px] text-muted">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{ESTIMATE_LABEL}</span>
    </p>
  );
}
