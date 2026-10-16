import { useState } from 'react';
import { AlertTriangle, Check, Lightbulb, X } from 'lucide-react';
import type {
  AiRequestInput,
  AiSuccess,
  AnalyzeErrorOutput,
  ExplainConceptOutput,
  GeneratePracticeOutput,
  ReviewWritingOutput,
} from '@linguo/shared';
import { SpeakButton } from '@/components/exercise/SpeakButton';
import { cn } from '@/lib/cn';
import { AnalyzeSentenceView, PlanReviewView, SessionSummaryView } from './AiMoreViews';
import { MarkdownLite } from './MarkdownLite';
import { parseAiResult } from './parse';

type Lang = 'en' | 'ko' | 'ja';

function SectionTitle({ children }: { children: string }) {
  return <h3 className="eyebrow">{children}</h3>;
}

export function ExplainView({ data, language }: { data: ExplainConceptOutput; language: Lang }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed">
      {data.summary && <p className="text-[17px] font-bold leading-snug tracking-[-0.01em]">{data.summary}</p>}
      {data.uncertainty && (
        <p className="flex items-start gap-2 rounded-2xl bg-warn/12 px-3 py-2 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            <strong>AI chưa chắc chắn:</strong> {data.uncertainty} Hãy đối chiếu với bài học.
          </span>
        </p>
      )}
      <MarkdownLite text={data.explanation_md} />
      {data.examples.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Ví dụ</SectionTitle>
          <ul className="space-y-2">
            {data.examples.map((ex, i) => (
              <li key={i} className="flex items-center gap-3 rounded-2xl bg-text/[0.03] px-3.5 py-2.5 ring-1 ring-border ring-inset">
                <span className="min-w-0 flex-1">
                  <span lang={language} className="block font-medium">
                    {ex.target}
                  </span>
                  <span className="block text-muted">{ex.vi}</span>
                </span>
                <SpeakButton text={ex.target} lang={language} label="Nghe câu ví dụ" size="sm" />
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.common_mistakes.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Lỗi hay gặp</SectionTitle>
          <ul className="list-disc space-y-1 pl-5">
            {data.common_mistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const VERDICT: Record<AnalyzeErrorOutput['verdict'], { label: string; className: string }> = {
  correct: { label: 'Câu trả lời đúng', className: 'bg-success/15 text-success-text' },
  minor_issue: { label: 'Gần đúng', className: 'bg-warn/15 text-text' },
  incorrect: { label: 'Chưa đúng', className: 'bg-error/12 text-error-text' },
};

export function AnalyzeView({ data, language }: { data: AnalyzeErrorOutput; language: Lang }) {
  const verdict = VERDICT[data.verdict];
  return (
    <div className="space-y-4 text-[15px] leading-relaxed">
      <p className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', verdict.className)}>{verdict.label}</span>
        {data.error_type && <span className="text-sm text-muted">Loại lỗi: {data.error_type}</span>}
      </p>
      <MarkdownLite text={data.explanation_md} />
      {data.corrected && (
        <section className="space-y-1">
          <SectionTitle>Câu đúng</SectionTitle>
          <div className="flex items-center gap-3 rounded-2xl bg-success/8 px-3.5 py-2.5 ring-1 ring-success/35 ring-inset">
            <p lang={language} className="min-w-0 flex-1 font-medium">
              {data.corrected}
            </p>
            <SpeakButton text={data.corrected} lang={language} label="Nghe câu đúng" size="sm" />
          </div>
        </section>
      )}
      {data.tip_vi && (
        <p className="flex items-start gap-2 rounded-2xl bg-primary/10 px-3 py-2">
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{data.tip_vi}</span>
        </p>
      )}
    </div>
  );
}

function PracticeItem({ item, index, language }: { item: GeneratePracticeOutput['items'][number]; index: number; language: Lang }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const answered = chosen !== null;
  const isCorrect = (option: string) => option.trim() === item.answer.trim();
  const right = answered && isCorrect(item.options[chosen] ?? '');
  return (
    <li className="space-y-2 rounded-2xl bg-text/[0.03] p-3.5 ring-1 ring-border ring-inset">
      <p className="font-semibold">
        <span className="text-muted">Câu {index + 1}. </span>
        <span lang={language}>{item.question}</span>{' '}
        <SpeakButton text={item.question} lang={language} label="Nghe câu hỏi" size="sm" className="align-middle" />
      </p>
      <div role="group" aria-label={`Lựa chọn câu ${index + 1}`} className="grid gap-2">
        {item.options.map((option, i) => {
          const picked = chosen === i;
          const correct = answered && isCorrect(option);
          return (
            <button
              key={i}
              type="button"
              aria-pressed={picked}
              disabled={answered}
              onClick={() => setChosen(i)}
              className={cn(
                'flex min-h-12 w-full items-center gap-2 rounded-2xl border-2 bg-surface-solid px-3.5 py-2 text-left font-medium shadow-[0_3px_0_var(--border)] transition-[translate,box-shadow,background-color]',
                'not-disabled:active:translate-y-[2px] not-disabled:active:shadow-[0_1px_0_var(--border)]',
                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 disabled:cursor-default',
                correct ? 'border-success bg-success/10 shadow-none' : picked ? 'border-error bg-error/10 shadow-none' : 'border-border not-disabled:hover:bg-text/5',
              )}
            >
              <span lang={language} className="min-w-0 flex-1 break-words">
                {option}
              </span>
              {correct && (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-success-text">
                  <Check aria-hidden className="size-4" />
                  Đáp án đúng
                </span>
              )}
              {picked && !correct && (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-error-text">
                  <X aria-hidden className="size-4" />
                  Bạn chọn
                </span>
              )}
            </button>
          );
        })}
      </div>
      {answered && (
        <div role="status" className="space-y-1 text-[15px]">
          <p className={cn('font-semibold', right ? 'text-success-text' : 'text-error-text')}>
            {right ? 'Chính xác!' : 'Chưa đúng.'}
          </p>
          <p>{item.explanation_vi}</p>
        </div>
      )}
    </li>
  );
}

/** Multiple-choice practice: each answer stays hidden until the learner picks an option. */
export function PracticeView({ data, language }: { data: GeneratePracticeOutput; language: Lang }) {
  return (
    <ol className="space-y-3">
      {data.items.map((item, i) => (
        <PracticeItem key={i} item={item} index={i} language={language} />
      ))}
    </ol>
  );
}

export const WRITING_FEEDBACK_LABEL = 'Phản hồi luyện tập — không phải điểm chính thức';

type RubricRow = Extract<AiRequestInput, { task: 'review_writing' }>['rubric'][number];

/** Rubric feedback on an essay: points per criterion are a practice estimate, never an official score. */
export function ReviewWritingView({ data, language, rubric = [] }: { data: ReviewWritingOutput; language: Lang; rubric?: RubricRow[] }) {
  const rows = data.criteria.map((c) => ({ ...c, rubric: rubric.find((r) => r.key === c.key) }));
  const complete = rows.length > 0 && rows.every((r) => r.rubric);
  const total = rows.reduce((sum, r) => sum + r.points, 0);
  const max = rows.reduce((sum, r) => sum + (r.rubric?.max_points ?? 0), 0);
  return (
    <div className="space-y-4 text-[15px] leading-relaxed">
      <p className="flex items-start gap-2 rounded-2xl bg-warn/12 px-3 py-2 text-sm font-semibold">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
        <span>{WRITING_FEEDBACK_LABEL}</span>
      </p>
      <section className="space-y-2">
        <SectionTitle>Theo tiêu chí</SectionTitle>
        <ul aria-label="Nhận xét theo tiêu chí" className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="space-y-1 rounded-2xl bg-text/[0.03] px-3.5 py-2.5 ring-1 ring-border ring-inset">
              <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-semibold">{row.rubric?.label_vi ?? row.key}</span>
                <span className="text-sm font-semibold text-muted">
                  {row.rubric ? `${row.points}/${row.rubric.max_points} điểm` : `${row.points} điểm`}
                </span>
              </p>
              <p className="break-words">{row.comment_vi}</p>
            </li>
          ))}
        </ul>
        {complete && <p className="text-sm font-semibold">Tổng tham khảo: {total}/{max} điểm</p>}
      </section>
      <section className="space-y-1">
        <SectionTitle>Nhận xét chung</SectionTitle>
        <p className="break-words">{data.overall_vi}</p>
      </section>
      <section className="space-y-1">
        <SectionTitle>Bài đã sửa</SectionTitle>
        <div className="flex items-start gap-3 rounded-2xl bg-success/8 px-3.5 py-2.5 ring-1 ring-success/35 ring-inset">
          <p lang={language} className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {data.corrected_version}
          </p>
          <SpeakButton text={data.corrected_version} lang={language} label="Nghe bài đã sửa" size="sm" />
        </div>
      </section>
    </div>
  );
}

/** Renders any AI success; an answer that fails its schema shows a short error instead. */
export function AiResultView({ result, language, request }: { result: AiSuccess; language: Lang; request?: AiRequestInput }) {
  const parsed = parseAiResult(result);
  if (!parsed) {
    return (
      <p role="alert" className="text-[15px] text-error-text">
        Không đọc được câu trả lời của AI. Vui lòng thử lại.
      </p>
    );
  }
  switch (parsed.task) {
    case 'explain_concept':
      return <ExplainView data={parsed.data} language={language} />;
    case 'analyze_error':
      return <AnalyzeView data={parsed.data} language={language} />;
    case 'generate_practice':
      return <PracticeView data={parsed.data} language={language} />;
    case 'review_writing':
      return <ReviewWritingView data={parsed.data} language={language} rubric={request?.task === 'review_writing' ? request.rubric : undefined} />;
    case 'analyze_sentence':
      return <AnalyzeSentenceView data={parsed.data} language={language} />;
    case 'summarize_session':
      return <SessionSummaryView data={parsed.data} />;
    case 'plan_review':
      return <PlanReviewView data={parsed.data} request={request?.task === 'plan_review' ? request : undefined} />;
    case 'roleplay_turn':
      // Role-play turns are chat bubbles on the role-play screen; this is only the plain reply.
      return (
        <p lang={language} className="break-words">
          {parsed.data.partner_reply}
        </p>
      );
  }
}
