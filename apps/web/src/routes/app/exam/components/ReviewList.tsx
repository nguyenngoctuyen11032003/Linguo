import { useId, useState } from 'react';
import { CheckCircle2, ChevronRight, CircleDashed, ClipboardCheck, Headphones, Lightbulb, XCircle } from 'lucide-react';
import type { ExamFamily, ExamResult } from '@linguo/shared';
import { cn } from '@/lib/cn';
import { SECTION_LABELS, familyLanguage, isAnswered, questionTypeLabel } from './labels';

export interface ReviewListProps {
  result: ExamResult;
}

type ReviewItem = ExamResult['review'][number];

/** Every question after submit: your answer vs the correct one, explanation, listening script, essay self-check. */
export function ReviewList({ result }: ReviewListProps) {
  return (
    <ol className="grid gap-4" aria-label="Xem lại từng câu">
      {result.review.map((item) => (
        <li key={item.question_id} className="min-w-0">
          <ReviewCard item={item} family={result.family} />
        </li>
      ))}
    </ol>
  );
}

const STATUS = {
  correct: { icon: CheckCircle2, label: 'Đúng', tone: 'border-success/50 bg-success/10 text-success-text' },
  wrong: { icon: XCircle, label: 'Sai', tone: 'border-error/50 bg-error/10 text-error-text' },
  blank: { icon: CircleDashed, label: 'Chưa trả lời', tone: 'border-border bg-text/5 text-muted' },
  essay: { icon: ClipboardCheck, label: 'Tự đánh giá', tone: 'border-primary/40 bg-primary/10 text-text' },
} as const;

function statusOf(item: ReviewItem): keyof typeof STATUS {
  if (item.kind === 'essay' || item.is_correct === null) return 'essay';
  if (!isAnswered(item.answer)) return 'blank';
  return item.is_correct ? 'correct' : 'wrong';
}

function ReviewCard({ item, family }: { item: ReviewItem; family: ExamFamily }) {
  const titleId = useId();
  const { prompt } = item;
  const answerLang = prompt.stem_lang !== 'vi' ? prompt.stem_lang : familyLanguage(family);
  const status = STATUS[statusOf(item)];
  const StatusIcon = status.icon;
  const script = prompt.script ?? (item.section === 'listening' ? prompt.tts_text : undefined);

  return (
    <article aria-labelledby={titleId} className="min-w-0 space-y-3 rounded-3xl border border-border bg-surface-solid p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="min-w-0 text-sm font-semibold text-muted break-words">
          Câu {item.seq} · {SECTION_LABELS[item.section]} · {questionTypeLabel(item.question_type)}
        </h3>
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold', status.tone)}>
          <StatusIcon aria-hidden className="size-4" />
          {status.label}
        </span>
      </header>

      <div className="max-w-prose space-y-3">
        <p className="text-sm text-muted">{prompt.instruction_vi}</p>
        {script && (
          <div className="rounded-2xl border border-border px-4 py-3">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-muted">
              <Headphones aria-hidden className="size-4" />
              Lời thoại
            </p>
            <p lang={answerLang} className="text-[17px] leading-relaxed whitespace-pre-line break-words">
              {script}
            </p>
          </div>
        )}
        {prompt.passage && (
          <p lang={prompt.stem_lang} className="rounded-2xl bg-bg/60 px-4 py-3 text-[17px] leading-relaxed whitespace-pre-line break-words">
            {prompt.passage}
          </p>
        )}
        <p lang={prompt.stem_lang} className="text-[17px] font-semibold break-words whitespace-pre-line">
          {prompt.stem}
        </p>

        {item.kind === 'essay' ? <EssayReview item={item} answerLang={answerLang} /> : <AnswerCompare item={item} answerLang={answerLang} />}

        <div className="rounded-2xl border border-border bg-bg/60 px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <Lightbulb aria-hidden className="size-4 text-gold" />
            Giải thích
          </p>
          <p className="text-[15px] break-words">{item.explanation.vi}</p>
        </div>
      </div>
    </article>
  );
}

function AnswerCompare({ item, answerLang }: { item: ReviewItem; answerLang: string }) {
  const options = item.prompt.options ?? [];
  const show = (value: string | null) => {
    if (value === null) return null;
    const option = options.find((o) => o.id === value);
    return option ? { text: option.text, lang: option.lang } : { text: value, lang: answerLang };
  };
  const mine = isAnswered(item.answer) ? show(item.answer) : null;
  const correct = show(item.correct_answer);

  return (
    <dl className="grid gap-1.5 text-[15px]">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <dt className="font-semibold">{item.kind === 'mcq' ? 'Bạn chọn:' : 'Câu trả lời của bạn:'}</dt>
        <dd className={cn('min-w-0 break-words', !item.is_correct && mine && 'line-through decoration-error/70')}>
          {mine ? <span lang={mine.lang}>{mine.text}</span> : <span className="text-muted">Chưa trả lời</span>}
        </dd>
      </div>
      {correct && (
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="inline-flex items-center gap-1 font-semibold text-success-text">
            <CheckCircle2 aria-hidden className="size-4 self-center" />
            Đáp án đúng:
          </dt>
          <dd lang={correct.lang} className="min-w-0 font-medium break-words">
            {correct.text}
          </dd>
        </div>
      )}
    </dl>
  );
}

function EssayReview({ item, answerLang }: { item: ReviewItem; answerLang: string }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const rubric = item.rubric ?? [];
  const max = rubric.reduce((sum, r) => sum + r.max_points, 0);
  const self = rubric.reduce((sum, r) => sum + (checked[r.key] ? r.max_points : 0), 0);

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-sm font-semibold">Bài làm của bạn</p>
        {isAnswered(item.answer) ? (
          <p lang={answerLang} className="rounded-2xl border border-border px-4 py-3 text-[16px] leading-relaxed whitespace-pre-wrap break-words">
            {item.answer}
          </p>
        ) : (
          <p className="text-muted">Bạn chưa viết bài.</p>
        )}
      </div>

      {rubric.length > 0 && (
        <fieldset className="rounded-2xl border border-border px-4 py-3">
          <legend className="px-1 text-sm font-semibold">Tự đánh giá theo tiêu chí</legend>
          <ul className="space-y-2">
            {rubric.map((r) => (
              <li key={r.key}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked[r.key] ?? false}
                    onChange={(e) => setChecked((c) => ({ ...c, [r.key]: e.target.checked }))}
                    className="mt-1 size-5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {r.label_vi} ({r.max_points} điểm)
                    </span>
                    <span className="block text-sm text-muted">{r.description_vi}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm font-semibold" aria-live="polite">
            Tự chấm: {self}/{max} điểm — chỉ để bạn theo dõi, không phải điểm chính thức.
          </p>
        </fieldset>
      )}

      {item.sample_answer && (
        <details className="group rounded-2xl border border-border px-4 py-3">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
            Xem bài mẫu
          </summary>
          <p lang={answerLang} className="mt-2 text-[16px] leading-relaxed whitespace-pre-wrap break-words">
            {item.sample_answer}
          </p>
        </details>
      )}
    </div>
  );
}
