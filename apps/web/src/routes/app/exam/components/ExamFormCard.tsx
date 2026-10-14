import { useId, useState } from 'react';
import { AlertTriangle, ChevronDown, Clock, History, ListChecks, Timer } from 'lucide-react';
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

/** Hub card for one exam form: label, level range, sections with timing, last attempt and the three modes. */
export function ExamFormCard({ form, warningVi, onStart, busy }: ExamFormCardProps) {
  const titleId = useId();
  const sectionsId = useId();
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const totalMinutes = form.sections.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const timed = form.sections.some((s) => s.minutes !== null);

  return (
    <SolidCard role="article" aria-labelledby={titleId} className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-text/5 px-3 py-1 text-xs font-bold tracking-wide">{FAMILY_LABELS[form.family]}</span>
        <span className="text-sm font-semibold text-muted">{levelRangeLabel(form.level_from, form.level_to)}</span>
        {form.is_demo && <DemoBadge />}
      </div>

      <div className="min-w-0">
        <h2 id={titleId} className="text-lg font-bold leading-snug break-words">
          {form.title_vi}
        </h2>
        <p className="mt-1 text-[15px] text-muted break-words">{form.description_vi}</p>
      </div>

      <SimulatedBadge />

      {warningVi && (
        <p role="note" className="flex items-start gap-2 rounded-2xl border border-warn/60 bg-warn/10 px-3 py-2 text-sm text-text">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
          <span className="min-w-0">{warningVi}</span>
        </p>
      )}

      <ul className="space-y-1 text-[15px]" aria-label="Các phần của đề">
        {form.sections.map((s) => (
          <li key={s.section} className="flex items-center gap-2">
            <Clock aria-hidden className="size-4 shrink-0 text-muted" />
            <span className="min-w-0">
              {SECTION_LABELS[s.section]}: {s.question_count} câu · {s.minutes !== null ? `${s.minutes} phút` : 'không giới hạn thời gian'}
            </span>
          </li>
        ))}
      </ul>

      {form.last_attempt && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <History aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0">
            Lần gần nhất: {formatScore(form.last_attempt.total)}/{formatScore(form.last_attempt.max)} điểm ·{' '}
            {formatDate(form.last_attempt.submitted_at)}
          </span>
        </p>
      )}

      <div className="grid gap-2">
        <Button variant="primary" block disabled={busy} onClick={() => onStart('full')}>
          <Timer aria-hidden className="size-5" />
          Thi thử toàn bài{timed && totalMinutes > 0 ? ` · ${totalMinutes} phút` : ''}
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
