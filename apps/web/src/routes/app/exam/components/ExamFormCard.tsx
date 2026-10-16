import { useId, useState } from 'react';
import { AlertTriangle, ChevronDown, Headphones, BookOpen, ListChecks, PenLine, Timer, type LucideIcon } from 'lucide-react';
import type { ExamFormSummary, ExamMode, ExamSection } from '@linguo/shared';
import { DemoBadge } from '@/components/exercise/Badges';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { cn } from '@/lib/cn';
import { FAMILY_LABELS, SECTION_LABELS, formatDate, formatScore, levelRangeLabel } from './labels';
import { SimulatedBadge } from './SimulatedBadge';

export interface ExamFormCardProps {
  form: ExamFormSummary;
  /** Path goal does not match the form (e.g. TOPIK II goal, TOPIK I form). */
  warningVi: string | null;
  /**
   * `full` starts a timed mock; `section` starts untimed practice of one section. `question_type` carries no
   * tag: the page opens the QuestionTypePicker for this form and starts the drill from its `onPick`.
   */
  onStart(mode: ExamMode, section?: ExamSection): void;
  busy: boolean;
}

const SECTION_ICONS: Record<ExamSection, LucideIcon> = { listening: Headphones, reading: BookOpen, writing: PenLine };

/** Hub card for one exam form: label, level range, sections with timing, last attempt and the three modes. */
export function ExamFormCard({ form, warningVi, onStart, busy }: ExamFormCardProps) {
  const titleId = useId();
  const sectionsId = useId();
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const totalMinutes = form.sections.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const totalQuestions = form.sections.reduce((sum, s) => sum + s.question_count, 0);
  const timed = form.sections.some((s) => s.minutes !== null);
  const last = form.last_attempt;
  const lastPct = last && last.max > 0 ? Math.round((last.total / last.max) * 100) : 0;

  return (
    <SolidCard role="article" aria-labelledby={titleId} className="relative isolate min-w-0 space-y-4 overflow-hidden">
      <div aria-hidden="true" className="absolute -right-16 -top-16 -z-10 size-44 rounded-full bg-radial from-primary/10 to-transparent to-70%" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-text px-3 py-1 font-display text-[15px] font-extrabold uppercase leading-none tracking-wide text-bg">
          {FAMILY_LABELS[form.family]}
        </span>
        <span className="text-[13px] font-semibold text-muted">{levelRangeLabel(form.level_from, form.level_to)}</span>
        {form.is_demo && <DemoBadge />}
      </div>

      <div className="min-w-0">
        <h2 id={titleId} className="text-[19px] font-bold leading-snug tracking-[-0.01em] break-words">
          {form.title_vi}
        </h2>
        <p className="mt-1 line-clamp-2 text-[14px] text-muted break-words">{form.description_vi}</p>
      </div>

      {/* Big numbers: questions, minutes and the last score. */}
      <div aria-hidden="true" className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-text/[0.04] p-3 ring-1 ring-border ring-inset">
          <span className="eyebrow block">Câu</span>
          <span className="stat-num mt-2 block text-[34px]">{totalQuestions}</span>
        </div>
        <div className="rounded-2xl bg-text/[0.04] p-3 ring-1 ring-border ring-inset">
          <span className="eyebrow block">Phút</span>
          <span className="stat-num mt-2 block text-[34px]">{timed && totalMinutes > 0 ? totalMinutes : '∞'}</span>
        </div>
        <div className={cn('rounded-2xl p-3 ring-1 ring-inset', last ? 'bg-accent/10 ring-accent/30' : 'bg-text/[0.04] ring-border')}>
          <span className="eyebrow block">Gần nhất</span>
          {last ? (
            <span className="mt-2 flex items-baseline gap-0.5">
              <span className="stat-num text-[34px] text-accent-text">{formatScore(last.total)}</span>
              <span className="text-[12px] font-semibold text-muted">/{formatScore(last.max)}</span>
            </span>
          ) : (
            <span className="stat-num mt-2 block text-[34px] text-muted">—</span>
          )}
        </div>
      </div>

      <SimulatedBadge />

      {warningVi && (
        <p role="note" className="flex items-start gap-2 rounded-2xl bg-warn/10 px-3 py-2 text-sm text-text ring-1 ring-warn/40 ring-inset">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
          <span className="min-w-0">{warningVi}</span>
        </p>
      )}

      <ul className="divide-y divide-border rounded-2xl ring-1 ring-border ring-inset" aria-label="Các phần của đề">
        {form.sections.map((s) => {
          const Icon = SECTION_ICONS[s.section];
          return (
            <li key={s.section} className="flex min-h-11 items-center gap-3 px-3 py-2">
              <Icon aria-hidden className="size-4 shrink-0 text-primary" />
              <span className="sr-only">
                {SECTION_LABELS[s.section]}: {s.question_count} câu · {s.minutes !== null ? `${s.minutes} phút` : 'không giới hạn thời gian'}
              </span>
              <span aria-hidden="true" className="min-w-0 flex-1 text-[15px] font-semibold">
                {SECTION_LABELS[s.section]}
              </span>
              <span aria-hidden="true" className="text-[13px] font-semibold tabular-nums text-muted">
                {s.question_count} câu · {s.minutes !== null ? `${s.minutes}′` : '∞'}
              </span>
            </li>
          );
        })}
      </ul>

      {last && (
        <div className="space-y-1.5">
          <p className="sr-only">
            Lần gần nhất: {formatScore(last.total)}/{formatScore(last.max)} điểm · {formatDate(last.submitted_at)}
          </p>
          <div aria-hidden="true" className="flex items-center justify-between text-[12px] font-semibold text-muted">
            <span>Lần gần nhất · {formatDate(last.submitted_at)}</span>
            <span className="tabular-nums">{lastPct}%</span>
          </div>
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-text/8">
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-[#ffc06b]" style={{ width: `${lastPct}%` }} />
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <Button variant="primary" size="lg" block disabled={busy} onClick={() => onStart('full')}>
          <Timer aria-hidden className="size-5 shrink-0" />
          <span className="flex min-w-0 flex-col items-center">
            <span>Thi thử toàn bài</span>
            {timed && totalMinutes > 0 && (
              <>
                <span aria-hidden="true" className="text-[13px] font-semibold opacity-85">
                  {totalMinutes} phút
                </span>
                <span className="sr-only">{` · ${totalMinutes} phút`}</span>
              </>
            )}
          </span>
        </Button>
        <Button
          variant="ghost"
          block
          disabled={busy}
          aria-expanded={sectionsOpen}
          aria-controls={sectionsId}
          onClick={() => setSectionsOpen((v) => !v)}
        >
          Luyện theo phần
          <ChevronDown aria-hidden className={cn('size-5 transition-transform', sectionsOpen && 'rotate-180')} />
        </Button>
        <div id={sectionsId} hidden={!sectionsOpen} className="flex flex-wrap gap-2">
          {form.sections.map((s) => (
            <Button key={s.section} variant="glass" disabled={busy} onClick={() => onStart('section', s.section)}>
              Luyện phần {SECTION_LABELS[s.section]}
            </Button>
          ))}
        </div>
        <Button variant="ghost" block disabled={busy || form.question_types.length === 0} onClick={() => onStart('question_type')}>
          <ListChecks aria-hidden className="size-5" />
          Luyện theo dạng câu
        </Button>
      </div>
    </SolidCard>
  );
}
