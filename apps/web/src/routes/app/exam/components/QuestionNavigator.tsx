import { useId } from 'react';
import { Check, Circle, Flag } from 'lucide-react';
import { EXAM_SECTIONS, type ExamServedQuestion } from '@linguo/shared';
import { cn } from '@/lib/cn';
import { SECTION_LABELS, isAnswered } from './labels';

export interface QuestionNavigatorProps {
  questions: ExamServedQuestion[];
  currentId: string;
  onGo(id: string): void;
}

/**
 * Question grid grouped by section. Each state has its own icon and a text name (sr-only on the button,
 * spelled out in the legend), so nothing relies on colour alone. Scrolls inside a capped height on mobile.
 */
export function QuestionNavigator({ questions, currentId, onGo }: QuestionNavigatorProps) {
  const baseId = useId();
  const answered = questions.filter((q) => isAnswered(q.answer)).length;

  return (
    <nav aria-label="Danh sách câu hỏi" className="min-w-0">
      <p className="mb-3 flex items-end gap-2">
        <span className="sr-only">
          Đã trả lời {answered}/{questions.length} câu
        </span>
        <span aria-hidden="true" className="stat-num text-[40px]">
          {answered}
        </span>
        <span aria-hidden="true" className="pb-0.5 text-[13px] font-semibold leading-tight text-muted">
          /{questions.length}
          <br />
          đã trả lời
        </span>
      </p>
      <div className="max-h-[40vh] space-y-3 overflow-y-auto overscroll-contain p-1 md:max-h-none">
        {EXAM_SECTIONS.map((section) => {
          const items = questions.filter((q) => q.section === section);
          if (items.length === 0) return null;
          const labelId = `${baseId}-${section}`;
          return (
            <div key={section} role="group" aria-labelledby={labelId}>
              <h3 id={labelId} className="eyebrow mb-1.5">
                {SECTION_LABELS[section]}
              </h3>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
                {items.map((q) => {
                  const done = isAnswered(q.answer);
                  const current = q.question_id === currentId;
                  const states = [done ? 'đã trả lời' : 'chưa trả lời', q.flagged && 'đã đánh dấu xem lại', current && 'câu đang làm']
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <li key={q.question_id}>
                      <button
                        type="button"
                        onClick={() => onGo(q.question_id)}
                        aria-current={current ? 'step' : undefined}
                        aria-label={`Câu ${q.seq}: ${states}`}
                        className={cn(
                          'relative flex h-11 w-full flex-col items-center justify-center rounded-2xl border text-sm font-bold tabular-nums transition-[background-color,scale] active:scale-95',
                          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
                          done ? 'border-primary/40 bg-primary/12' : 'border-dashed border-input-border bg-surface-solid',
                          current && 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-bg',
                        )}
                      >
                        <span aria-hidden="true">{q.seq}</span>
                        <span aria-hidden="true" className="flex items-center gap-0.5 leading-none">
                          {done ? <Check className="size-3 text-primary" /> : <Circle className="size-2.5 text-muted" />}
                          {q.flagged && <Flag className="size-3 fill-current text-gold" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <ul aria-hidden="true" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li className="inline-flex items-center gap-1">
          <Check className="size-3.5 text-primary" />
          Đã trả lời
        </li>
        <li className="inline-flex items-center gap-1">
          <Circle className="size-3" />
          Chưa trả lời
        </li>
        <li className="inline-flex items-center gap-1">
          <Flag className="size-3.5 fill-current text-gold" />
          Đánh dấu
        </li>
        <li className="inline-flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm ring-2 ring-primary" />
          Đang làm
        </li>
      </ul>
    </nav>
  );
}
