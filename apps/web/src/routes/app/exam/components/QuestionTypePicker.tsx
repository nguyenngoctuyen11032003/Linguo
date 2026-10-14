import { useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { EXAM_DRILL_SIZE, EXAM_SECTIONS, type ExamFormSummary } from '@linguo/shared';
import { SECTION_LABELS, questionTypeLabel } from './labels';

export interface QuestionTypePickerProps {
  form: ExamFormSummary;
  onPick(questionType: string): void;
}

/** Question types of a form grouped by section; picking one starts a drill of up to 10 questions. */
export function QuestionTypePicker({ form, onPick }: QuestionTypePickerProps) {
  const headingId = useId();
  if (form.question_types.length === 0) {
    return <p className="text-[15px] text-muted">Đề này chưa có dạng câu để luyện.</p>;
  }

  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted">
        Mỗi lượt luyện tối đa {EXAM_DRILL_SIZE} câu cùng dạng, lấy từ các đề cùng loại, không tính giờ.
      </p>
      {EXAM_SECTIONS.map((section) => {
        const types = form.question_types.filter((t) => t.section === section);
        if (types.length === 0) return null;
        const groupId = `${headingId}-${section}`;
        return (
          <div key={section} role="group" aria-labelledby={groupId} className="min-w-0">
            <h4 id={groupId} className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              {SECTION_LABELS[section]}
            </h4>
            <ul className="grid gap-2">
              {types.map((t) => (
                <li key={t.question_type}>
                  <button
                    type="button"
                    onClick={() => onPick(t.question_type)}
                    className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface-solid px-4 py-2 text-left transition-colors hover:bg-text/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
                  >
                    <span className="min-w-0 flex-1 font-medium break-words">{questionTypeLabel(t.question_type)}</span>
                    <span className="shrink-0 text-sm text-muted">{t.count} câu</span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
