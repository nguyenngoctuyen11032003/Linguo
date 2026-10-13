import { Dumbbell } from 'lucide-react';
import type { ExamResult } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { SECTION_LABELS, questionTypeLabel } from './labels';

export interface QuestionTypeBreakdownProps {
  result: ExamResult;
  /** Starts a `question_type` drill for this tag. */
  onDrill(questionType: string): void;
}

/** Accuracy of an auto-graded row; essay-only rows (no graded questions) sort last. */
const accuracy = (row: { correct: number; total: number }) => (row.total > 0 ? row.correct / row.total : Number.POSITIVE_INFINITY);

/** Question types, weakest first, each with "Luyện dạng này". */
export function QuestionTypeBreakdown({ result, onDrill }: QuestionTypeBreakdownProps) {
  const rows = result.by_question_type
    .map((row, index) => ({ row, index }))
    .sort((a, b) => accuracy(a.row) - accuracy(b.row) || a.index - b.index)
    .map(({ row }) => row);

  if (rows.length === 0) return null;

  return (
    <ul aria-label="Kết quả theo dạng câu" className="grid gap-2">
      {rows.map((row) => {
        const label = questionTypeLabel(row.question_type);
        const graded = row.total > 0;
        const percent = graded ? Math.round((row.correct / row.total) * 100) : 0;
        return (
          <li key={row.question_type} className="min-w-0 rounded-2xl border border-border bg-surface-solid px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold break-words">{label}</h3>
                <p className="text-sm text-muted">
                  {SECTION_LABELS[row.section]} ·{' '}
                  {graded ? `${row.correct}/${row.total} câu đúng (${percent}%)` : 'Không chấm tự động'}
                </p>
              </div>
              <Button variant="ghost" aria-label={`Luyện dạng này: ${label}`} onClick={() => onDrill(row.question_type)}>
                <Dumbbell aria-hidden className="size-4" />
                Luyện dạng này
              </Button>
            </div>
            {graded && (
              <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-text/10">
                <div className={percent < 50 ? 'h-full rounded-full bg-error' : 'h-full rounded-full bg-success'} style={{ width: `${percent}%` }} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
