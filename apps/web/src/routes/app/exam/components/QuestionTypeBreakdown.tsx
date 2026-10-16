import { Dumbbell } from 'lucide-react';
import type { ExamResult } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
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
          <li key={row.question_type} className="card min-w-0 rounded-3xl px-4 py-3.5">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={cn('stat-num w-14 shrink-0 pt-1 text-[34px]', !graded ? 'text-muted' : percent < 50 ? 'text-error-text' : 'text-success-text')}
              >
                {graded ? percent : '—'}
                {graded && <span className="text-[16px]">%</span>}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold leading-snug break-words">{label}</h3>
                <p className="mt-0.5 text-[13px] text-muted">
                  {SECTION_LABELS[row.section]} ·{' '}
                  {graded ? `${row.correct}/${row.total} câu đúng (${percent}%)` : 'Không chấm tự động'}
                </p>
                {graded && (
                  <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-text/8">
                    <div className={cn('h-full rounded-full', percent < 50 ? 'bg-error' : 'bg-success')} style={{ width: `${percent}%` }} />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" aria-label={`Luyện dạng này: ${label}`} onClick={() => onDrill(row.question_type)}>
                <Dumbbell aria-hidden className="size-4" />
                Luyện dạng này
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
