import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { DEFAULT_TIMEZONE } from '@linguo/shared';
import { DemoBadge, ExerciseFrame } from '@/components/exercise';
import { lessonAiContext } from '@/components/exercise/ai-context';
import { Button, buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { LessonRunApi, LessonStep } from '@/features/lesson-player/types';
import { useLessonRun } from '@/features/lesson-player/useLessonRun';
import { useProfile } from '@/features/profile/ProfileProvider';
import { SESSION_PAGE_PATH } from '@/features/session-link/params';
import { useSessionReturn } from '@/features/session-link/useSessionReturn';
import { ExitSheet } from './ExitSheet';
import { LessonProgress } from './LessonProgress';
import { questionPosition } from './progress';
import { StepExamples } from './StepExamples';
import { StepExplain } from './StepExplain';
import { StepMistake } from './StepMistake';
import { StepNextReview } from './StepNextReview';
import { StepObjective } from './StepObjective';
import { StepSummary } from './StepSummary';
import { playSound, resetAnswerStreak } from '@/lib/sound';

const CONTENT_TITLES = {
  explain: 'Giải thích',
  examples: 'Ví dụ',
  mistake: 'Lỗi thường gặp',
  objective: 'Bắt đầu bài học',
  summary: 'Tóm tắt',
  next_review: 'Hoàn thành bài học',
} as const;

const LEARN_PATH = '/app/hoc-tap';

function stepTitle(run: LessonRunApi, step: LessonStep): string {
  if (step.kind === 'exercise') {
    const { current, total } = questionPosition(run.steps, run.stepIndex);
    return `Câu ${current}/${total}`;
  }
  return CONTENT_TITLES[step.kind];
}

function questionLabel(steps: LessonStep[], index: number): string {
  const step = steps[index];
  const label = `Câu ${questionPosition(steps, index).current}`;
  return step?.kind === 'exercise' && step.recheck ? `${label} (làm lại)` : label;
}

/** Full-screen lesson player at /app/hoc-tap/bai/:lessonId (outside AppLayout, like onboarding). */
export function LessonPage() {
  const { lessonId = '' } = useParams();
  const run = useLessonRun(lessonId);
  // A combo never carries over from another lesson.
  useEffect(resetAnswerStreak, [lessonId]);
  // A run in progress opens with the start cue, once per run (a restart is a new run); a completed run opens silently on its summary.
  const startedRun = useRef<string | null>(null);
  const { runId, runStatus } = run;
  useEffect(() => {
    if (!runId || runStatus !== 'in_progress' || startedRun.current === runId) return;
    startedRun.current = runId;
    resetAnswerStreak();
    playSound('start');
  }, [runId, runStatus]);
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [exitOpen, setExitOpen] = useState(false);
  /** Opened from a study session (?phien=&muc=): report the activity on completion and lead back to it. */
  const sessionReturn = useSessionReturn();
  const fromSession = sessionReturn.link !== null;
  const [returning, setReturning] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement & HTMLParagraphElement>(null);
  const { status, step, stepIndex, lesson } = run;
  const completed = !!run.completeResult;
  const { reportDone } = sessionReturn;

  useEffect(() => {
    if (fromSession && completed) void reportDone();
  }, [fromSession, completed, reportDone]);

  async function backToSession() {
    setReturning(true);
    try {
      await sessionReturn.returnToSession();
    } finally {
      setReturning(false);
    }
  }

  // Move focus to the new step's heading so screen readers announce it and Tab starts from the top.
  useEffect(() => {
    if (status === 'ready') titleRef.current?.focus();
  }, [status, stepIndex]);

  function leave() {
    navigate(fromSession ? SESSION_PAGE_PATH : LEARN_PATH);
  }

  const header = (
    <header className="pt-safe min-[1024px]:border-b min-[1024px]:border-[var(--hairline)]">
      <div className="mx-auto flex min-h-16 w-full max-w-xl min-[1024px]:max-w-[42rem] items-center gap-2 px-safe py-2">
        <button
          ref={closeRef}
          type="button"
          onClick={() => (run.pendingCount > 0 ? setExitOpen(true) : leave())}
          aria-label="Thoát bài học"
          className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/5 hover:text-text"
        >
          <X aria-hidden className="size-6" strokeWidth={2.5} />
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          {status === 'ready' && lesson && (
            <h1 className="truncate text-[13px] font-semibold leading-tight text-muted" title={lesson.title.vi}>
              {lesson.title.vi}
            </h1>
          )}
          {status === 'ready' && run.steps.length > 0 && <LessonProgress steps={run.steps} stepIndex={stepIndex} />}
        </div>
      </div>
    </header>
  );

  const exitSheet = (
    <ExitSheet
      open={exitOpen}
      onClose={() => setExitOpen(false)}
      onExit={leave}
      pendingCount={run.pendingCount}
      triggerRef={closeRef}
    />
  );

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        {header}
        <main id="main" className="mx-auto w-full max-w-xl min-[1024px]:max-w-[42rem] flex-1 px-safe pt-3">
          <div role="status" className="space-y-4">
            <span className="sr-only">Đang tải bài học…</span>
            <Skeleton className="block h-8 w-2/3" />
            <Skeleton className="block h-24 w-full rounded-2xl" />
            <Skeleton className="block h-24 w-full rounded-2xl" />
          </div>
        </main>
        {exitSheet}
      </div>
    );
  }

  if (status === 'error' || !lesson || !step) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        {header}
        <main id="main" className="mx-auto w-full max-w-xl min-[1024px]:max-w-[42rem] flex-1 space-y-4 px-safe pt-3">
          <h1 className="sr-only">Bài học</h1>
          <ErrorState
            title="Không tải được bài học"
            description={run.error ?? 'Bài học chưa có nội dung. Hãy thử lại sau.'}
            onRetry={run.retry}
          />
          <Link to={LEARN_PATH} className={buttonClasses('ghost', 'md', true)}>
            Về danh sách bài
          </Link>
        </main>
        {exitSheet}
      </div>
    );
  }

  let body: ReactNode = null;
  let footer: ReactNode = null;
  const canGoBack = stepIndex > 0;
  const contentFooter = (
    <div className="flex gap-3">
      {canGoBack && (
        <Button variant="ghost" size="lg" onClick={run.back}>
          Quay lại
        </Button>
      )}
      <div className="flex-1">
        <Button variant="accent" size="lg" block onClick={run.next}>
          Tiếp tục
        </Button>
      </div>
    </div>
  );

  switch (step.kind) {
    case 'objective':
      body = <StepObjective lesson={lesson} />;
      footer = contentFooter;
      break;
    case 'explain':
      body = <StepExplain blocks={lesson.body} />;
      footer = contentFooter;
      break;
    case 'examples':
      body = <StepExamples blocks={lesson.body} />;
      footer = contentFooter;
      break;
    case 'mistake':
      body = <StepMistake blocks={lesson.body} />;
      footer = contentFooter;
      break;
    case 'exercise': {
      const exercise = run.exercises[step.exerciseId];
      const { exerciseId, queueIndex } = step;
      if (exercise) {
        // ExerciseFrame brings its own sticky action bar.
        body = (
          <ExerciseFrame
            key={`${exerciseId}:${queueIndex}`}
            exercise={exercise}
            state={run.exerciseState(exerciseId, queueIndex)}
            recheck={step.recheck}
            runId={run.runId}
            onSubmit={(response, meta) => void run.submit(exerciseId, queueIndex, response, meta)}
            onContinue={run.next}
            ai={lessonAiContext(lesson, exercise, run.items)}
            reportable
            bleed
          />
        );
      } else {
        body = <p role="alert">Không tìm thấy bài tập này. Bạn có thể bỏ qua và học tiếp.</p>;
        footer = contentFooter;
      }
      break;
    }
    case 'summary':
      body = (
        <StepSummary
          blocks={lesson.body}
          result={run.completeResult}
          canComplete={run.canComplete}
          pendingCount={run.pendingCount}
          unresolved={run.unresolved.map((index) => ({ stepIndex: index, label: questionLabel(run.steps, index) }))}
          onComplete={run.complete}
          onResume={run.goTo}
        />
      );
      footer = (
        <div className="flex gap-3">
          {/* Reopening a finished lesson shows its summary; a new run starts only from here. */}
          {run.runStatus === 'completed' && (
            <Button variant="ghost" size="lg" onClick={run.restart}>
              <RotateCcw aria-hidden className="size-5" />
              Học lại
            </Button>
          )}
          <div className="flex-1">
            <Button variant="accent" size="lg" block disabled={!run.completeResult} onClick={run.next}>
              Tiếp tục
            </Button>
          </div>
        </div>
      );
      break;
    case 'next_review':
      body = <StepNextReview nextReviewAt={run.completeResult?.next_review_at ?? null} timeZone={profile?.timezone ?? DEFAULT_TIMEZONE} />;
      footer = fromSession ? (
        <div className="flex gap-3">
          <Button variant="ghost" size="lg" onClick={() => navigate('/app')}>
            Về trang chủ
          </Button>
          <div className="flex-1">
            <Button variant="accent" size="lg" block loading={returning} onClick={() => void backToSession()}>
              Quay lại phiên học
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="accent" size="lg" block onClick={() => navigate('/app')}>
          Về trang chủ
        </Button>
      );
      break;
  }

  const isExercise = step.kind === 'exercise' && !footer;
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {header}
      <main
        id="main"
        className={cn(
          'mx-auto flex w-full max-w-xl min-[1024px]:max-w-[42rem] flex-1 flex-col px-safe pt-2 text-[17px] leading-relaxed min-[1024px]:pt-8 min-[1024px]:text-[18px]',
          // Content steps sit above the fixed footer; an exercise brings its own sticky bar (no extra space under it).
          !isExercise && 'pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]',
        )}
      >
        <div className="flex flex-wrap items-center gap-2 empty:hidden">
          {lesson.is_demo && <DemoBadge />}
          {step.kind === 'exercise' && step.recheck && <span className="sr-only">Làm lại câu sai</span>}
        </div>
        {step.kind === 'exercise' ? (
          // The header already shows "Câu n/N": keep this as the announced focus target only.
          <p ref={titleRef} tabIndex={-1} aria-live="polite" className="sr-only">
            {stepTitle(run, step)}
          </p>
        ) : (
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="mt-3 font-display text-[clamp(36px,11vw,46px)] min-[1024px]:text-[52px] font-extrabold uppercase leading-[1.08] tracking-[-0.005em] focus:outline-none"
          >
            {stepTitle(run, step)}
          </h2>
        )}
        <div key={stepIndex} className={cn('reveal flex min-w-0 flex-col', isExercise ? 'mt-3 flex-1' : 'mt-6')}>{body}</div>
      </main>
      {footer && (
        <footer className="fixed inset-x-0 bottom-0 z-30 bg-bg pb-safe before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-8 before:bg-gradient-to-t before:from-bg before:to-transparent">
          <div className="mx-auto w-full max-w-xl min-[1024px]:max-w-[42rem] px-safe pt-3 pb-4">{footer}</div>
        </footer>
      )}
      {exitSheet}
    </div>
  );
}
