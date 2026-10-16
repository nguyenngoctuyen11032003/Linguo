import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { ChevronRight, Compass, Flag, MessagesSquare, RefreshCw, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { ANALYZE_SENTENCE_MAX_CHARS, LANGUAGES, LEVEL_INFO, type AiRequestInput, type AiSuccess, type LevelCode } from '@linguo/shared';
import {
  AI_LABEL,
  AiFallback,
  AiLoading,
  AiNoticeDialog,
  AiQuotaChip,
  AiReportDialog,
  AiResultView,
  AiTextarea,
  useQuotaGate,
  type QuotaGate,
} from '@/components/ai';
import { Button, buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAiNotice } from '@/features/ai-tutor/useAiNotice';
import type { AiQuota } from '@/features/ai-tutor/quota';
import { useAiQuota } from '@/features/ai-tutor/useAiQuota';
import { useAiTutor, type AiTutorState as UseAiTutor } from '@/features/ai-tutor/useAiTutor';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';

type Tab = 'explain' | 'practice' | 'sentence';
type PracticeSkill = 'vocabulary' | 'grammar' | 'reading';

const TABS: { id: Tab; label: string }[] = [
  { id: 'explain', label: 'Hỏi khái niệm' },
  { id: 'practice', label: 'Tạo bài luyện' },
  { id: 'sentence', label: 'Phân tích câu' },
];

const SKILLS: { id: PracticeSkill; label: string }[] = [
  { id: 'vocabulary', label: 'Từ vựng' },
  { id: 'grammar', label: 'Ngữ pháp' },
  { id: 'reading', label: 'Đọc hiểu' },
];
const COUNTS = [1, 2, 3, 4, 5].map((n) => ({ id: n, label: String(n) }));

const CONCEPT_MAX = 300;
const FOCUS_MAX = 300;
const SENTENCE_MAX = ANALYZE_SENTENCE_MAX_CHARS;
const CONCEPT_PLACEHOLDER = {
  en: 'Ví dụ: khi nào dùng present perfect?',
  ko: 'Ví dụ: khác nhau giữa 은/는 và 이/가',
  ja: 'Ví dụ: khác nhau giữa は và が',
} as const;
const SENTENCE_PLACEHOLDER = { en: 'Ví dụ: I have lived here for two years.', ko: 'Ví dụ: 저는 학생이에요.', ja: 'Ví dụ: 私は学生です。' } as const;

interface HistoryEntry {
  key: string;
  title: string;
  request: AiRequestInput;
  result: AiSuccess;
}

/** Asks for the privacy notice first, then runs the request. */
function useGatedRun(ai: UseAiTutor, notice: ReturnType<typeof useAiNotice>) {
  const [pending, setPending] = useState<AiRequestInput | null>(null);
  const lastRef = useRef<AiRequestInput | null>(null);
  const start = (req: AiRequestInput) => {
    lastRef.current = req;
    if (notice.acknowledged) void ai.run(req);
    else setPending(req);
  };
  const accept = async () => {
    if (!(await notice.ack())) return false;
    const req = pending;
    setPending(null);
    if (req) void ai.run(req);
    return true;
  };
  // Asked before the acknowledgement had loaded: a learner who already acknowledged is not asked again.
  const run = ai.run;
  useEffect(() => {
    if (!pending || !notice.acknowledged) return;
    setPending(null);
    void run(pending);
  }, [pending, notice.acknowledged, run]);
  // The notice only opens once it is known that the learner has not acknowledged it yet.
  const asking = pending !== null && !notice.acknowledged && notice.status !== 'loading';
  return { start, accept, pending, asking, cancel: () => setPending(null), lastRef };
}

/** Records each successful answer once, newest first. */
function useHistory(ai: UseAiTutor, lastRef: { current: AiRequestInput | null }, titleOf: (req: AiRequestInput) => string) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const result = ai.state === 'ok' ? ai.result : null;
  const titleRef = useRef(titleOf);
  titleRef.current = titleOf;
  useEffect(() => {
    const request = lastRef.current;
    if (!result || !request) return;
    setHistory((h) =>
      h.some((e) => e.result === result)
        ? h
        : [{ key: `${result.response_id}-${h.length}`, title: titleRef.current(request), request, result }, ...h],
    );
  }, [result, lastRef]);
  return history;
}

function TabButton({
  tab,
  selected,
  onSelect,
  onKeyDown,
  refCallback,
}: {
  tab: (typeof TABS)[number];
  selected: boolean;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  refCallback: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={refCallback}
      type="button"
      role="tab"
      id={`tutor-tab-${tab.id}`}
      aria-controls={`tutor-panel-${tab.id}`}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'min-h-11 flex-1 rounded-full px-2 text-[14px] font-bold whitespace-nowrap transition-[background-color,color,scale] active:scale-95 min-[380px]:px-4 min-[380px]:text-[15px]',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
        selected ? 'bg-primary text-on-primary shadow-[0_6px_16px_-6px_var(--primary)]' : 'text-muted hover:bg-text/5 hover:text-text',
      )}
    >
      {tab.label}
    </button>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const labelId = useId();
  return (
    <div className="space-y-1.5">
      <p id={labelId} className="eyebrow px-1">
        {label}
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.id)}
            type="button"
            aria-pressed={o.id === value}
            onClick={() => onChange(o.id)}
            className={cn(
              'min-h-11 min-w-11 rounded-full border-2 px-4 text-[15px] font-bold transition-[translate,box-shadow,background-color]',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 active:translate-y-[2px]',
              o.id === value
                ? 'border-primary bg-primary/12 text-primary shadow-[0_3px_0_var(--primary-depth)] active:shadow-[0_1px_0_var(--primary-depth)]'
                : 'border-border bg-surface-solid shadow-[0_3px_0_var(--border)] hover:bg-text/5 active:shadow-[0_1px_0_var(--border)]',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultCard({
  entry,
  language,
  latest,
  actions,
  headingRef,
  titleLang,
}: {
  entry: HistoryEntry;
  language: 'en' | 'ko' | 'ja';
  latest: boolean;
  actions: ReactNode;
  /** Receives focus when this answer arrives (latest card only). */
  headingRef?: Ref<HTMLHeadingElement>;
  /** Language of the title when it is the learner's own target-language text. */
  titleLang?: 'en' | 'ko' | 'ja';
}) {
  const content = (
    <div className="space-y-4">
      <AiResultView result={entry.result} language={language} />
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">{actions}</div>
    </div>
  );
  if (latest) {
    return (
      <article className="card space-y-3 rounded-tl-lg p-4">
        <header className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow-[0_6px_16px_-6px_var(--primary)]"
          >
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <h3 ref={headingRef} tabIndex={-1} lang={titleLang} className="scroll-mt-24 break-words text-[17px] font-bold leading-snug focus:outline-none">
              {entry.title}
            </h3>
            <p className="text-[13px] text-muted">{AI_LABEL}</p>
          </div>
        </header>
        {content}
      </article>
    );
  }
  return (
    <details className="group card rounded-3xl px-4 py-2">
      <summary lang={titleLang} className="flex min-h-11 cursor-pointer items-center gap-2 break-words font-semibold">
        <Sparkles aria-hidden className="size-4 shrink-0 text-primary" />
        {entry.title}
      </summary>
      <div className="pt-2">
        <p className="mb-3 text-sm text-muted">{AI_LABEL}</p>
        {content}
      </div>
    </details>
  );
}

interface PanelProps {
  language: 'en' | 'ko' | 'ja';
  level: string;
  notice: ReturnType<typeof useAiNotice>;
  quota: AiQuota | null;
  onReport: (usageId: string, trigger: HTMLButtonElement) => void;
}

function TutorPanel({
  ai,
  gate,
  history,
  language,
  quota,
  onReport,
  loadingLabel,
  form,
  extraActions,
  titleLang,
}: Omit<PanelProps, 'notice' | 'level'> & {
  ai: UseAiTutor;
  gate: ReturnType<typeof useGatedRun>;
  history: HistoryEntry[];
  loadingLabel: string;
  form: ReactNode;
  extraActions?: (entry: HistoryEntry) => ReactNode;
  titleLang?: 'en' | 'ko' | 'ja';
}) {
  const { reduceMotion } = useMotionPrefs();
  const latestHeading = useRef<HTMLHeadingElement>(null);
  const latestKey = history[0]?.key;
  const seenKey = useRef(latestKey);

  // A new answer: move focus to its heading and bring it into view (no smooth scroll with reduced motion).
  useEffect(() => {
    if (!latestKey || latestKey === seenKey.current) return;
    seenKey.current = latestKey;
    const heading = latestHeading.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView?.({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [latestKey, reduceMotion]);

  let status: ReactNode = null;
  if (ai.state === 'loading') status = <AiLoading label={loadingLabel} />;
  else if (ai.state === 'ok') status = <p className="sr-only">Đã có câu trả lời</p>;
  else if (ai.state === 'quota' || ai.state === 'unavailable' || ai.state === 'error') {
    status = (
      <AiFallback
        state={ai.state}
        error={ai.error}
        quota={quota}
        onRetry={() => gate.lastRef.current && gate.start(gate.lastRef.current)}
      />
    );
  }
  return (
    <div className="space-y-5">
      {form}
      <div aria-live="polite" aria-busy={ai.state === 'loading' || undefined}>
        {status}
      </div>
      {history.length > 0 && (
        <section aria-label="Lịch sử trong phiên" className="space-y-3">
          {history.map((entry, i) => (
            <ResultCard
              key={entry.key}
              entry={entry}
              language={language}
              latest={i === 0}
              headingRef={i === 0 ? latestHeading : undefined}
              titleLang={titleLang}
              actions={
                <>
                  {i === 0 && extraActions?.(entry)}
                  <Button variant="ghost" onClick={(e) => onReport(entry.result.response_id, e.currentTarget)}>
                    <Flag aria-hidden className="size-4" />
                    Báo lỗi
                  </Button>
                </>
              }
            />
          ))}
          {history.length > 1 && <p className="text-sm text-muted">Lịch sử chỉ lưu trong phiên này và mất khi tải lại trang.</p>}
        </section>
      )}
    </div>
  );
}

/** Submit button that switches off, with the reason tied to it, once today's AI turns are used up. */
function SubmitButton({ quotaGate, busy, children }: { quotaGate: QuotaGate; busy: boolean; children: ReactNode }) {
  const hintId = useId();
  return (
    <div className="space-y-2">
      <Button
        type="submit"
        variant="accent"
        block
        loading={busy}
        disabled={quotaGate.exhausted}
        aria-describedby={quotaGate.hint ? hintId : undefined}
      >
        {children}
      </Button>
      {quotaGate.hint && (
        <p id={hintId} className="px-1 text-sm text-muted">
          {quotaGate.hint} Bài học và ôn tập vẫn dùng bình thường.
        </p>
      )}
    </div>
  );
}

/** One line of text for the request: line breaks (from pasting) become spaces. */
const flatten = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim();

function ExplainTab({ language, level, notice, quota, onReport }: PanelProps) {
  const ai = useAiTutor();
  const gate = useGatedRun(ai, notice);
  const quotaGate = useQuotaGate(quota);
  const history = useHistory(ai, gate.lastRef, (req) => (req.task === 'explain_concept' ? req.concept : ''));
  const [concept, setConcept] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const busy = ai.state === 'loading';

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (quotaGate.exhausted || busy) return;
    const text = flatten(concept);
    if (!text) {
      setError('Hãy nhập điều bạn muốn hỏi.');
      return;
    }
    setError(null);
    gate.start({ task: 'explain_concept', language, level, concept: text, variant: 'default' });
  };

  return (
    <>
      <TutorPanel
        ai={ai}
        gate={gate}
        history={history}
        language={language}
        quota={quota}
        onReport={onReport}
        loadingLabel="Đang soạn giải thích…"
        form={
          <form onSubmit={submit} noValidate className="card space-y-3 p-4">
            <label htmlFor={inputId} className="eyebrow block px-1">
              Bạn muốn hiểu điều gì?
            </label>
            <AiTextarea
              id={inputId}
              value={concept}
              maxLength={CONCEPT_MAX}
              invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              placeholder={CONCEPT_PLACEHOLDER[language]}
              onValueChange={setConcept}
              onSubmitShortcut={() => submit()}
            />
            {error && (
              <p id={errorId} role="alert" className="px-1 text-sm text-error-text">
                {error}
              </p>
            )}
            <SubmitButton quotaGate={quotaGate} busy={busy}>
              Hỏi gia sư
            </SubmitButton>
          </form>
        }
        extraActions={(entry) =>
          entry.request.task === 'explain_concept' && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => gate.start({ ...(entry.request as Extract<AiRequestInput, { task: 'explain_concept' }>), variant: 'different' })}
            >
              <RefreshCw aria-hidden className="size-4" />
              Giải thích cách khác
            </Button>
          )
        }
      />
      <AiNoticeDialog open={gate.asking} onAccept={gate.accept} onClose={gate.cancel} />
    </>
  );
}

function PracticeTab({ language, level, notice, quota, onReport }: PanelProps) {
  const ai = useAiTutor();
  const gate = useGatedRun(ai, notice);
  const quotaGate = useQuotaGate(quota);
  const history = useHistory(ai, gate.lastRef, (req) => {
    if (req.task !== 'generate_practice') return '';
    const skill = SKILLS.find((s) => s.id === req.skill)?.label ?? '';
    return req.focus ? `${skill}: ${req.focus}` : `Bài luyện ${skill.toLowerCase()}`;
  });
  const [skill, setSkill] = useState<PracticeSkill>('vocabulary');
  const [count, setCount] = useState<number>(3);
  const [focus, setFocus] = useState('');
  const focusId = useId();
  const busy = ai.state === 'loading';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (quotaGate.exhausted || busy) return;
    const text = focus.trim();
    gate.start({ task: 'generate_practice', language, level, skill, count, ...(text ? { focus: text } : {}) });
  };

  return (
    <>
      <TutorPanel
        ai={ai}
        gate={gate}
        history={history}
        language={language}
        quota={quota}
        onReport={onReport}
        loadingLabel="Đang soạn bài luyện…"
        form={
          <form onSubmit={submit} noValidate className="card space-y-4 p-4">
            <Segmented label="Kỹ năng" options={SKILLS} value={skill} onChange={setSkill} />
            <Segmented label="Số câu" options={COUNTS} value={count} onChange={setCount} />
            <div className="space-y-1.5">
              <label htmlFor={focusId} className="eyebrow block px-1">
                Chủ đề (không bắt buộc)
              </label>
              <Input
                id={focusId}
                value={focus}
                maxLength={FOCUS_MAX}
                placeholder="Ví dụ: đồ ăn, thì quá khứ…"
                onChange={(e) => setFocus(e.target.value)}
              />
            </div>
            <p className="px-1 text-sm text-muted">Đáp án được ẩn cho tới khi bạn chọn.</p>
            <SubmitButton quotaGate={quotaGate} busy={busy}>
              Tạo bài luyện
            </SubmitButton>
          </form>
        }
      />
      <AiNoticeDialog open={gate.asking} onAccept={gate.accept} onClose={gate.cancel} />
    </>
  );
}

/** "Phân tích câu": parts of speech, components, grammar points and meanings of one sentence (spec 8.2 #4). */
function SentenceTab({ language, level, notice, quota, onReport }: PanelProps) {
  const ai = useAiTutor();
  const gate = useGatedRun(ai, notice);
  const quotaGate = useQuotaGate(quota);
  const history = useHistory(ai, gate.lastRef, (req) => (req.task === 'analyze_sentence' ? req.sentence : ''));
  const [sentence, setSentence] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const busy = ai.state === 'loading';

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (quotaGate.exhausted || busy) return;
    const text = flatten(sentence);
    if (!text) {
      setError('Hãy nhập một câu để phân tích.');
      return;
    }
    setError(null);
    gate.start({ task: 'analyze_sentence', language, level, sentence: text });
  };

  return (
    <>
      <TutorPanel
        ai={ai}
        gate={gate}
        history={history}
        language={language}
        quota={quota}
        onReport={onReport}
        loadingLabel="Đang phân tích câu…"
        titleLang={language}
        form={
          <form onSubmit={submit} noValidate className="card space-y-3 p-4">
            <label htmlFor={inputId} className="eyebrow block px-1">
              Câu bạn muốn phân tích
            </label>
            <AiTextarea
              id={inputId}
              lang={language}
              value={sentence}
              maxLength={SENTENCE_MAX}
              invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              placeholder={SENTENCE_PLACEHOLDER[language]}
              onValueChange={setSentence}
              onSubmitShortcut={() => submit()}
            />
            {error && (
              <p id={errorId} role="alert" className="px-1 text-sm text-error-text">
                {error}
              </p>
            )}
            <SubmitButton quotaGate={quotaGate} busy={busy}>
              Phân tích câu
            </SubmitButton>
          </form>
        }
      />
      <AiNoticeDialog open={gate.asking} onAccept={gate.accept} onClose={gate.cancel} />
    </>
  );
}

function LoadingPage() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Đang tải lộ trình…</span>
      <Skeleton className="block h-11 w-full rounded-full" />
      <Skeleton className="block h-12 w-full rounded-full" />
      <Skeleton className="block h-24 w-full rounded-2xl" />
    </div>
  );
}

/** /app/gia-su: ask about a concept or generate practice for the current path's language and level. */
export function TutorPage() {
  const paths = useLearningPaths();
  const notice = useAiNotice();
  const quota = useAiQuota();
  const [tab, setTab] = useState<Tab>('explain');
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ explain: null, practice: null, sentence: null });
  const [report, setReport] = useState<string | null>(null);
  const reportTriggerRef = useRef<HTMLElement | null>(null);

  const path = paths.current;

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = TABS[next]!.id;
    setTab(id);
    tabRefs.current[id]?.focus();
  };

  const onReport = (usageId: string, trigger: HTMLButtonElement) => {
    reportTriggerRef.current = trigger;
    setReport(usageId);
  };

  let content: ReactNode;
  if (!path) {
    if (paths.status === 'loading') content = <LoadingPage />;
    else if (paths.status === 'error') content = <ErrorState title="Không tải được lộ trình" onRetry={paths.reload} />;
    else {
      content = (
        <EmptyState
          icon={Compass}
          title="Bạn chưa có lộ trình"
          description="Gia sư AI giải thích theo ngôn ngữ và trình độ trong lộ trình của bạn. Hãy tạo lộ trình trước nhé."
          action={
            <Link to="/app/bat-dau" className={buttonClasses('accent')}>
              Tạo lộ trình
            </Link>
          }
        />
      );
    }
  } else {
    const panelProps: PanelProps = {
      language: path.language,
      level: path.currentLevel,
      notice,
      quota: quota.quota,
      onReport,
    };
    content = (
      <div className="space-y-5">
        <div role="tablist" aria-label="Chế độ gia sư" className="glass flex gap-1 rounded-full p-1 shadow-[var(--shadow-card)]">
          {TABS.map((t) => (
            <TabButton
              key={t.id}
              tab={t}
              selected={tab === t.id}
              onSelect={() => setTab(t.id)}
              onKeyDown={onTabKey}
              refCallback={(el) => {
                tabRefs.current[t.id] = el;
              }}
            />
          ))}
        </div>
        {TABS.map((t) => (
          <div key={t.id} role="tabpanel" id={`tutor-panel-${t.id}`} aria-labelledby={`tutor-tab-${t.id}`} hidden={tab !== t.id}>
            {t.id === 'explain' ? <ExplainTab {...panelProps} /> : t.id === 'practice' ? <PracticeTab {...panelProps} /> : <SentenceTab {...panelProps} />}
          </div>
        ))}
      </div>
    );
  }

  const levelLabel = path ? (LEVEL_INFO[path.currentLevel as LevelCode]?.label ?? path.currentLevel) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="page-title">Gia sư AI</h1>
          <AiQuotaChip quota={quota.quota} />
        </div>
        {path && (
          <p className="text-[14px] text-muted">
            {LANGUAGES[path.language].nameVi} · trình độ {levelLabel}. Câu trả lời do AI tạo, có thể chưa chính xác.
          </p>
        )}
        <Link
          to="/app/dong-vai"
          className="group mt-1 flex min-h-14 items-center gap-3 rounded-full bg-accent/10 py-1.5 pl-1.5 pr-4 text-[15px] font-bold ring-1 ring-accent/25 ring-inset transition-[background-color,scale] hover:bg-accent/15 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
        >
          <span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
            <MessagesSquare className="size-5" />
          </span>
          <span className="min-w-0 flex-1">Đóng vai hội thoại với AI</span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-accent-text transition-transform group-hover:translate-x-0.5" />
        </Link>
      </header>
      {content}
      <AiReportDialog open={report !== null} onClose={() => setReport(null)} usageId={report} triggerRef={reportTriggerRef} />
    </div>
  );
}
