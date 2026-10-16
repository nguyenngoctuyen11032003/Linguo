import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, CloudOff, Loader2, Send, X } from 'lucide-react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import type { ExamAttempt } from '@linguo/shared';
import { playContentAudioOnce } from '@/features/audio/content-audio';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { track } from '@/features/analytics';
import { canSpeak, onVoicesChanged, speak, stopSpeaking } from '@/features/exam/tts';
import { useExamAttempt, type ExamSaveState } from '@/features/exam/useExamAttempt';
import {
  ExamTimer,
  QuestionNavigator,
  QuestionView,
  SECTION_LABELS,
  SubmitDialog,
  examResultHref,
  familyLanguage,
  isAnswered,
} from './components';
import { EXAM_HUB_PATH, examEventProps, listenLimitFor } from './exam-page-utils';
import { LeaveExamDialog } from './LeaveExamDialog';

const SAVE_LABELS: Record<ExamSaveState, string> = {
  idle: '',
  saving: 'Đang lưu…',
  saved: 'Đã lưu câu trả lời',
  offline: 'Mất kết nối — câu trả lời sẽ được lưu khi có mạng',
  error: 'Chưa lưu được câu trả lời',
};

/**
 * Plays a recorded listening asset. `onStarted` fires once `play()` has resolved (playback really began); the
 * promise resolves `true` when the clip ends, `false` when it could not play (network error, autoplay block).
 */
function playAsset(assetId: string, onStarted: () => void): Promise<boolean> {
  // Generated recordings resolve to the content-audio bucket (features/audio); legacy paths play as before.
  return playContentAudioOnce(assetId, onStarted);
}

/** TTS availability for the attempt language; voices can load after the first render. */
function useVoice(lang: 'en' | 'ko' | 'ja'): boolean {
  const [ready, setReady] = useState(() => canSpeak(lang));
  useEffect(() => {
    const update = () => setReady(canSpeak(lang));
    update();
    const off = onVoicesChanged(update);
    return () => {
      off();
      stopSpeaking();
    };
  }, [lang]);
  return ready;
}

/** /app/luyen-thi/lam-bai/:attemptId — full-screen exam runner (outside AppLayout, like the lesson player). */
export function ExamRunnerPage() {
  const { attemptId = '' } = useParams();
  const [retry, setRetry] = useState(0);
  return <ExamRunner key={`${attemptId}:${retry}`} attemptId={attemptId} onRetry={() => setRetry((n) => n + 1)} />;
}

function ExamRunner({ attemptId, onRetry }: { attemptId: string; onRetry(): void }) {
  const run = useExamAttempt(attemptId);
  const navigate = useNavigate();
  const { status, attempt, result } = run;
  const active = status === 'running' || status === 'submitting';
  const [submitOpen, setSubmitOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const sawRunning = useRef(false);
  const allowLeave = useRef(false);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
    if (status === 'running') sawRunning.current = true;
  }, [active, status]);

  // In-app navigation away (back button, links) asks first; the result page is always allowed.
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) =>
        activeRef.current && !allowLeave.current && currentLocation.pathname !== nextLocation.pathname,
      [],
    ),
  );

  // Closing the tab or reloading: the browser's own confirmation (answers are saved on pagehide either way).
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);

  useEffect(() => {
    if (status !== 'finished' || !result) return;
    if (sawRunning.current) {
      track('exam_completed', examEventProps({ family: result.family, mode: result.mode, section: attempt?.section ?? null }));
    }
    allowLeave.current = true;
    navigate(examResultHref(result.attempt_id), { replace: true, state: { result } });
  }, [status, result, attempt?.section, navigate]);

  const leave = () => {
    setLeaveOpen(false);
    allowLeave.current = true;
    if (blocker.state === 'blocked') blocker.proceed();
    else navigate(EXAM_HUB_PATH);
  };
  const stay = () => {
    setLeaveOpen(false);
    if (blocker.state === 'blocked') blocker.reset();
  };
  const leaveDialog = (
    <LeaveExamDialog open={leaveOpen || blocker.state === 'blocked'} timed={attempt?.deadline_at != null} onStay={stay} onLeave={leave} />
  );

  if (status === 'loading' || status === 'finished' || (status !== 'error' && !attempt)) {
    return (
      <Shell title="Bài thi" onExit={() => navigate(EXAM_HUB_PATH)}>
        <div role="status" className="space-y-4">
          <span className="sr-only">{status === 'finished' ? 'Đang mở kết quả…' : 'Đang tải bài thi…'}</span>
          <Skeleton className="block h-6 w-1/2" />
          <Skeleton className="block h-32 w-full rounded-2xl" />
          <Skeleton className="block h-40 w-full rounded-2xl" />
        </div>
      </Shell>
    );
  }

  if (status === 'error' || !attempt) {
    return (
      <Shell title="Bài thi" onExit={() => navigate(EXAM_HUB_PATH)}>
        <div className="space-y-4">
          <ErrorState title="Không tải được bài thi" description={run.error ?? undefined} onRetry={onRetry} />
          <Link to={EXAM_HUB_PATH} className={buttonClasses('ghost', 'md', true)}>
            Về Luyện thi
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <>
      <RunningExam attempt={attempt} run={run} onExit={() => setLeaveOpen(true)} submitOpen={submitOpen} setSubmitOpen={setSubmitOpen} />
      {leaveDialog}
    </>
  );
}

function Shell({
  title,
  onExit,
  children,
  header,
  progress,
}: {
  title: string;
  onExit(): void;
  children: ReactNode;
  header?: ReactNode;
  /** Share of questions answered (0..1): a hairline bar along the header bottom. */
  progress?: number;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="glass sticky top-0 z-30 border-x-0! border-t-0! pt-safe">
        <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center gap-2 px-safe py-2">
          <button
            type="button"
            onClick={onExit}
            aria-label="Thoát bài thi"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-text/5 transition-[background-color,scale] hover:bg-text/10 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            <X aria-hidden className="size-5" />
          </button>
          {header ?? <h1 className="min-w-0 flex-1 truncate text-base font-bold">{title}</h1>}
        </div>
        {progress !== undefined && (
          <div aria-hidden="true" className="h-1 bg-text/8">
            <div
              className="h-full rounded-r-full bg-gradient-to-r from-primary to-accent transition-[width] duration-500 ease-[var(--ease-expo)]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-safe pt-4 pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>
    </div>
  );
}

interface RunningExamProps {
  attempt: ExamAttempt;
  run: ReturnType<typeof useExamAttempt>;
  onExit(): void;
  submitOpen: boolean;
  setSubmitOpen(open: boolean): void;
}

function RunningExam({ attempt, run, onExit, submitOpen, setSubmitOpen }: RunningExamProps) {
  const questions = attempt.questions;
  const [currentId, setCurrentId] = useState<string>(
    () => (questions.find((q) => !isAnswered(q.answer)) ?? questions[0])?.question_id ?? '',
  );
  const index = Math.max(0, questions.findIndex((q) => q.question_id === currentId));
  const current = questions[index];
  const language = familyLanguage(attempt.family);
  const voiceReady = useVoice(language);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const submitting = run.status === 'submitting';

  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [currentId]);

  const go = (id: string) => {
    moved.current = true;
    stopSpeaking();
    setCurrentId(id);
  };

  const onListen = useCallback(
    async (text: string | null, assetId: string | null, onStarted: () => void): Promise<boolean> => {
      if (assetId) return playAsset(assetId, onStarted);
      if (!text) return false;
      // The Web Speech API has no "started" signal: a read-through (or a stop) counts, a synthesis error does not.
      return speak(text, language).then(
        () => true,
        () => false,
      );
    },
    [language],
  );

  const unanswered = questions.filter((q) => !isAnswered(q.answer)).length;
  const flagged = questions.filter((q) => q.flagged).length;
  const prev = questions[index - 1];
  const next = questions[index + 1];

  if (!current) return null;

  const header = (
    <>
      <div className="min-w-0 flex-1">
        {/* Below 380 px the title line is visually dropped (still the page heading for screen readers) so the
            "Phần X · Câu n/N" position keeps the room. */}
        <h1 className="text-[15px] font-bold leading-tight max-[379px]:sr-only min-[380px]:truncate">{attempt.form_title_vi}</h1>
        {/* The non-breaking space keeps the dot with the section, so a narrow phone wraps as "Phần Nghe ·" / "Câu n/N". */}
        <p className="text-[13px] font-semibold leading-tight text-muted min-[380px]:truncate">
          Phần {SECTION_LABELS[current.section]}{' '}· Câu{' '}{index + 1}/{questions.length}
        </p>
      </div>
      <ExamTimer remainingMs={run.remainingMs} />
    </>
  );

  return (
    <Shell title={attempt.form_title_vi} onExit={onExit} header={header} progress={(questions.length - unanswered) / Math.max(1, questions.length)}>
      <div className="space-y-4 md:grid md:grid-cols-[minmax(0,1fr)_16rem] md:items-start md:gap-8 md:space-y-0">
        <div className="min-w-0 space-y-4">
          <SaveStatus state={run.saveState} />
          {run.error && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl bg-error/10 px-4 py-3 text-[15px] text-error-text ring-1 ring-error/40 ring-inset">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">{run.error}</span>
            </p>
          )}
          {attempt.structure_warning_vi && (
            <p role="note" className="flex items-start gap-2 rounded-2xl bg-warn/10 px-3 py-2 text-sm ring-1 ring-warn/40 ring-inset">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
              <span className="min-w-0">{attempt.structure_warning_vi}</span>
            </p>
          )}
          <h2 ref={headingRef} tabIndex={-1} className="sr-only">
            Câu {index + 1} trên {questions.length}
          </h2>
          <fieldset disabled={submitting} className="min-w-0">
            <QuestionView
              question={current}
              language={language}
              listenLimit={listenLimitFor(attempt.mode)}
              onAnswer={(a) => run.setAnswer(current.question_id, a)}
              onToggleFlag={() => run.toggleFlag(current.question_id)}
              onListen={onListen}
              canListen={voiceReady}
            />
          </fieldset>
        </div>
        <aside aria-label="Điều hướng câu hỏi" className="card min-w-0 p-4 md:sticky md:top-24">
          <QuestionNavigator questions={questions} currentId={current.question_id} onGo={go} />
        </aside>
      </div>

      <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:px-0">
        {/* From md the dock lines up with the question column (the navigator card takes the right 16rem + 2rem gap). */}
        <div className="mx-auto w-full max-w-5xl md:px-safe">
          <div className="glass pointer-events-auto mx-auto flex w-full max-w-3xl items-center gap-2 rounded-[1.75rem] p-2 shadow-[var(--shadow-dock)] md:mr-[18rem] md:ml-0 md:w-auto md:max-w-none">
            <Button variant="ghost" aria-label="Câu trước" disabled={!prev || submitting} onClick={() => prev && go(prev.question_id)} className="px-3">
              <ChevronLeft aria-hidden className="size-5" />
              <span className="hidden sm:inline">Câu trước</span>
            </Button>
            <Button variant="ghost" aria-label="Câu tiếp" disabled={!next || submitting} onClick={() => next && go(next.question_id)} className="px-3">
              <span className="hidden sm:inline">Câu tiếp</span>
              <ChevronRight aria-hidden className="size-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <Button variant="accent" block loading={submitting} disabled={submitting} onClick={() => setSubmitOpen(true)}>
                {!submitting && <Send aria-hidden className="size-5" />}
                {submitting ? 'Đang nộp bài…' : 'Nộp bài'}
              </Button>
            </div>
          </div>
        </div>
      </footer>

      <SubmitDialog
        open={submitOpen}
        unanswered={unanswered}
        flagged={flagged}
        onCancel={() => setSubmitOpen(false)}
        onConfirm={() => {
          setSubmitOpen(false);
          void run.submit();
        }}
      />
    </Shell>
  );
}

function SaveStatus({ state }: { state: ExamSaveState }) {
  const label = SAVE_LABELS[state];
  return (
    <p role="status" aria-live="polite" className="flex min-h-5 items-center gap-1.5 text-sm text-muted">
      {state === 'saving' && <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />}
      {state === 'offline' && <CloudOff aria-hidden className="size-4" />}
      {label}
    </p>
  );
}
