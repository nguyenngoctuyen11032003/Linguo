import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Compass, Flag, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { LANGUAGES, LEVEL_INFO, type AiRequestInput, type AiSuccess, type LevelCode } from '@linguo/shared';
import { AI_LABEL, AiFallback, AiLoading, AiNoticeDialog, AiQuotaChip, AiReportDialog, AiResultView } from '@/components/ai';
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

type Tab = 'explain' | 'practice';
type PracticeSkill = 'vocabulary' | 'grammar' | 'reading';

const TABS: { id: Tab; label: string }[] = [
  { id: 'explain', label: 'Hỏi khái niệm' },
  { id: 'practice', label: 'Tạo bài luyện' },
];

const SKILLS: { id: PracticeSkill; label: string }[] = [
  { id: 'vocabulary', label: 'Từ vựng' },
  { id: 'grammar', label: 'Ngữ pháp' },
  { id: 'reading', label: 'Đọc hiểu' },
];
const COUNTS = [1, 2, 3, 4, 5].map((n) => ({ id: n, label: String(n) }));

const CONCEPT_MAX = 300;
const FOCUS_MAX = 300;

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
  return { start, accept, pending, cancel: () => setPending(null), lastRef };
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
        'min-h-11 flex-1 rounded-full px-4 text-[15px] font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
        selected ? 'bg-primary text-on-primary' : 'text-muted hover:bg-text/5',
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
      <p id={labelId} className="px-1 text-sm font-medium">
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
              'min-h-11 min-w-11 rounded-full border px-4 text-[15px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
              o.id === value ? 'border-primary bg-primary/12 text-primary' : 'border-border hover:bg-text/5',
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
}: {
  entry: HistoryEntry;
  language: 'en' | 'ko';
  latest: boolean;
  actions: ReactNode;
}) {
  const content = (
    <div className="space-y-4">
      <AiResultView result={entry.result} language={language} />
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">{actions}</div>
    </div>
  );
  if (latest) {
    return (
      <article className="space-y-3 rounded-3xl border border-border bg-surface-solid p-4 shadow-[var(--shadow-card)]">
        <header className="space-y-1">
          <h3 className="font-semibold">{entry.title}</h3>
          <p className="text-sm text-muted">{AI_LABEL}</p>
        </header>
        {content}
      </article>
    );
  }
  return (
    <details className="group rounded-3xl border border-border bg-surface-solid px-4 py-3">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold">{entry.title}</summary>
      <div className="pt-2">
        <p className="mb-3 text-sm text-muted">{AI_LABEL}</p>
        {content}
      </div>
    </details>
  );
}

interface PanelProps {
  language: 'en' | 'ko';
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
}: Omit<PanelProps, 'notice' | 'level'> & {
  ai: UseAiTutor;
  gate: ReturnType<typeof useGatedRun>;
  history: HistoryEntry[];
  loadingLabel: string;
  form: ReactNode;
  extraActions?: (entry: HistoryEntry) => ReactNode;
}) {
  let status: ReactNode = null;
  if (ai.state === 'loading') status = <AiLoading label={loadingLabel} />;
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

function ExplainTab({ language, level, notice, quota, onReport }: PanelProps) {
  const ai = useAiTutor();
  const gate = useGatedRun(ai, notice);
  const history = useHistory(ai, gate.lastRef, (req) => (req.task === 'explain_concept' ? req.concept : ''));
  const [concept, setConcept] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const busy = ai.state === 'loading';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = concept.trim();
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
          <form onSubmit={submit} noValidate className="space-y-3">
            <label htmlFor={inputId} className="block px-1 text-sm font-medium">
              Bạn muốn hiểu điều gì?
            </label>
            <Input
              id={inputId}
              value={concept}
              maxLength={CONCEPT_MAX}
              invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              placeholder={language === 'ko' ? 'Ví dụ: khác nhau giữa 은/는 và 이/가' : 'Ví dụ: khi nào dùng present perfect?'}
              onChange={(e) => setConcept(e.target.value)}
            />
            {error && (
              <p id={errorId} role="alert" className="px-1 text-sm text-error-text">
                {error}
              </p>
            )}
            <Button type="submit" variant="accent" loading={busy}>
              Hỏi gia sư
            </Button>
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
      <AiNoticeDialog open={gate.pending !== null} onAccept={gate.accept} onClose={gate.cancel} />
    </>
  );
}

function PracticeTab({ language, level, notice, quota, onReport }: PanelProps) {
  const ai = useAiTutor();
  const gate = useGatedRun(ai, notice);
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
          <form onSubmit={submit} noValidate className="space-y-4">
            <Segmented label="Kỹ năng" options={SKILLS} value={skill} onChange={setSkill} />
            <Segmented label="Số câu" options={COUNTS} value={count} onChange={setCount} />
            <div className="space-y-1.5">
              <label htmlFor={focusId} className="block px-1 text-sm font-medium">
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
            <Button type="submit" variant="accent" loading={busy}>
              Tạo bài luyện
            </Button>
          </form>
        }
      />
      <AiNoticeDialog open={gate.pending !== null} onAccept={gate.accept} onClose={gate.cancel} />
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
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ explain: null, practice: null });
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
        <div role="tablist" aria-label="Chế độ gia sư" className="glass flex gap-1 rounded-full p-1">
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
            {t.id === 'explain' ? <ExplainTab {...panelProps} /> : <PracticeTab {...panelProps} />}
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
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Gia sư AI</h1>
          <AiQuotaChip quota={quota.quota} />
        </div>
        {path && (
          <p className="text-[15px] text-muted">
            {LANGUAGES[path.language].nameVi} · trình độ {levelLabel}. Câu trả lời do AI tạo, có thể chưa chính xác.
          </p>
        )}
      </header>
      {content}
      <AiReportDialog open={report !== null} onClose={() => setReport(null)} usageId={report} triggerRef={reportTriggerRef} />
    </div>
  );
}
