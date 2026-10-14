import { AlertTriangle, ArrowRight, Lightbulb } from 'lucide-react';
import { Link } from 'react-router';
import type { AiRequestInput, AnalyzeSentenceOutput, PlanReviewOutput, SummarizeSessionOutput } from '@linguo/shared';
import { cn } from '@/lib/cn';
import { tagLabel } from './tag-labels';

// AI sheet views of analyze_sentence, summarize_session and plan_review (spec 8.2 #4, #9, #7).

type Lang = 'en' | 'ko';

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h3>;
}

const POS_LABELS: Record<AnalyzeSentenceOutput['tokens'][number]['pos'], string> = {
  noun: 'danh từ',
  pronoun: 'đại từ',
  verb: 'động từ',
  auxiliary: 'trợ động từ',
  adjective: 'tính từ',
  adverb: 'trạng từ',
  determiner: 'từ hạn định',
  preposition: 'giới từ',
  conjunction: 'liên từ',
  interjection: 'thán từ',
  particle: 'tiểu từ',
  ending: 'đuôi từ',
  number: 'số từ',
  other: 'khác',
};

const COMPONENT_LABELS: Record<AnalyzeSentenceOutput['components'][number]['label'], string> = {
  subject: 'Chủ ngữ',
  predicate: 'Vị ngữ',
  object: 'Tân ngữ',
  complement: 'Bổ ngữ',
  adverbial: 'Trạng ngữ',
  modifier: 'Thành phần bổ nghĩa',
  topic: 'Chủ đề',
  other: 'Thành phần khác',
};

/** Part of speech per token, sentence components, grammar points, natural and alternative meanings. */
export function AnalyzeSentenceView({ data, language }: { data: AnalyzeSentenceOutput; language: Lang }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed">
      {data.uncertainty && (
        <p className="flex items-start gap-2 rounded-2xl bg-warn/12 px-3 py-2 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            <strong>AI chưa chắc chắn:</strong> {data.uncertainty} Hãy đối chiếu với bài học.
          </span>
        </p>
      )}
      <section className="space-y-1">
        <SectionTitle>Nghĩa tự nhiên</SectionTitle>
        <p className="text-[17px] font-semibold break-words">{data.translation_vi}</p>
        {data.alternative_meanings.length > 0 && (
          <ul aria-label="Nghĩa khác" className="list-disc space-y-1 pl-5 text-muted">
            {data.alternative_meanings.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <SectionTitle>Từng từ</SectionTitle>
        <ul aria-label="Từ loại từng từ" className="space-y-2">
          {data.tokens.map((t, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 rounded-2xl border border-border px-3 py-2">
              <span lang={language} className="font-semibold break-words">
                {t.text}
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{POS_LABELS[t.pos]}</span>
              <span className="min-w-0 break-words text-muted">{t.meaning_vi}</span>
            </li>
          ))}
        </ul>
      </section>
      {data.components.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Thành phần câu</SectionTitle>
          <ul aria-label="Thành phần câu" className="space-y-2">
            {data.components.map((c, i) => (
              <li key={i} className="rounded-2xl border border-border px-3 py-2">
                <p>
                  <span className="font-semibold">{COMPONENT_LABELS[c.label]}: </span>
                  <span lang={language} className="break-words">
                    {c.text}
                  </span>
                </p>
                <p className="break-words text-muted">{c.note_vi}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.grammar_points.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Điểm ngữ pháp</SectionTitle>
          <ul aria-label="Điểm ngữ pháp" className="space-y-2">
            {data.grammar_points.map((g, i) => (
              <li key={i} className="space-y-0.5 rounded-2xl bg-text/5 px-3 py-2">
                <p lang={language} className="font-semibold break-words">
                  {g.pattern}
                </p>
                <p className="break-words">{g.explanation_vi}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Warm recap of a session: what was done, up to three errors to remember and one next step. */
export function SessionSummaryView({ data }: { data: SummarizeSessionOutput }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed">
      <p className="text-[17px] font-semibold break-words">{data.recap_vi}</p>
      {data.errors_to_remember.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Cần nhớ</SectionTitle>
          <ul aria-label="Lỗi cần nhớ" className="space-y-2">
            {data.errors_to_remember.map((e, i) => (
              <li key={i} className="rounded-2xl border border-border px-3 py-2">
                <p className="font-semibold">{tagLabel(e.tag)}</p>
                <p className="break-words">{e.note_vi}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="space-y-1">
        <SectionTitle>Bước tiếp theo</SectionTitle>
        <p className="flex items-start gap-2 rounded-2xl bg-primary/10 px-3 py-2">
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="break-words">{data.next_step_vi}</span>
        </p>
      </section>
    </div>
  );
}

const REVIEW_ROUTE = '/app/on-tap';
const lessonRoute = (lessonId: string) => `/app/hoc-tap/bai/${lessonId}`;

type PlanRequest = Extract<AiRequestInput, { task: 'plan_review' }>;

const LINK_CLASS = cn(
  'inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline',
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
);

/**
 * Review plan: every step is an action the app can do, built from an id of the request's gaps (a step whose id
 * is not in the request is not shown, however the answer got here).
 */
export function PlanReviewView({ data, request }: { data: PlanReviewOutput; request?: PlanRequest }) {
  const gaps = request?.gaps ?? [];
  const steps = data.steps.flatMap((step) => {
    const gap = gaps.find((g) => g.kind === (step.kind === 'redo_lesson' ? 'lesson' : 'tag') && g.id === step.target);
    return gap ? [{ step, gap }] : [];
  });
  return (
    <div className="space-y-4 text-[15px] leading-relaxed">
      <p className="text-[17px] font-semibold break-words">{data.summary_vi}</p>
      <section className="space-y-2">
        <SectionTitle>Kế hoạch ôn</SectionTitle>
        <ol aria-label="Các bước ôn tập" className="space-y-2">
          {steps.map(({ step, gap }, i) => (
            <li key={i} className="space-y-1 rounded-2xl border border-border px-3 py-2">
              <p className="font-semibold break-words">
                <span className="text-muted">Bước {i + 1}. </span>
                {step.kind === 'redo_lesson' ? `Học lại bài ${gap.label}` : `Ôn ${step.cards ?? 10} thẻ: ${gap.label}`}
              </p>
              <p className="break-words text-muted">{step.reason_vi}</p>
              <Link to={step.kind === 'redo_lesson' ? lessonRoute(gap.id) : REVIEW_ROUTE} className={LINK_CLASS}>
                {step.kind === 'redo_lesson' ? 'Mở bài học' : 'Mở ôn tập'}
                <ArrowRight aria-hidden className="size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
