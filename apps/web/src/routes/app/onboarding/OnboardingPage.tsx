import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  createPathSchema,
  defaultTarget,
  DEFAULT_TIMEZONE,
  estimatePath,
  fieldErrors,
  isLevelAvailable,
  LANGUAGE_CODES,
  LANGUAGES,
  suggestedCurrentLevel,
  type LanguageCode,
} from '@linguo/shared';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { track } from '@/features/analytics';
import { presetFromWeek } from '@/features/learning-paths/components/schedule';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { createPath, type LearningPath } from '@/features/learning-paths/service';
import { useReferenceHours } from '@/features/learning-paths/useReferenceHours';
import { useProfile } from '@/features/profile/ProfileProvider';
import { cn } from '@/lib/cn';
import { todayIso } from '@/lib/dates';
import { requireSupabase } from '@/lib/supabase';
import { isStepValid, resolveStep, resolveTargetDate, scheduleOf, stepHint, visibleSteps, type StepNumber } from './logic';
import { OnboardingCelebration } from './OnboardingCelebration';
import { OnboardingProgress } from './OnboardingProgress';
import { StepCurrentLevel } from './StepCurrentLevel';
import { StepGoal } from './StepGoal';
import { StepLanguage } from './StepLanguage';
import { StepReview } from './StepReview';
import { StepSchedule } from './StepSchedule';
import { StepStartPoint } from './StepStartPoint';
import { useOnboardingDraft } from './useOnboardingDraft';

const TITLES: Record<StepNumber, string> = {
  1: 'Bạn muốn học ngôn ngữ nào?',
  2: 'Bạn đang ở đâu?',
  3: 'Trình độ hiện tại của bạn',
  4: 'Mục tiêu của bạn',
  5: 'Bạn học được bao lâu?',
  6: 'Xem lại lộ trình',
};

export function OnboardingPage() {
  const [params, setParams] = useSearchParams();
  const langParam = params.get('lang');
  const initialLanguage = (LANGUAGE_CODES as readonly string[]).includes(langParam ?? '') ? (langParam as LanguageCode) : undefined;
  const { draft, discarded, update, goTo, reset, clear } = useOnboardingDraft();
  const paths = useLearningPaths();
  const { profile } = useProfile();
  const reference = useReferenceHours();
  const toast = useToast();
  const navigate = useNavigate();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const creatingRef = useRef(false);
  const discardedToast = useRef(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pathExists, setPathExists] = useState(false);
  const [created, setCreated] = useState<LearningPath | null>(null);
  const [langHandled, setLangHandled] = useState(false);

  const today = todayIso(profile?.timezone ?? DEFAULT_TIMEZONE);
  const ready = paths.status === 'ready';
  const taken = paths.paths.map((p) => p.language);

  // ?lang= starts a fresh draft at step 2 when that language is free; a taken one is ignored (keeps the draft).
  if (!langHandled && ready) {
    setLangHandled(true);
    if (initialLanguage && LANGUAGES[initialLanguage].available && !taken.includes(initialLanguage) && draft.data.language !== initialLanguage) {
      reset({ version: 1, step: 2, data: { language: initialLanguage } });
    }
  }

  const data = draft.data;
  const ctx = { taken, today };
  const steps = visibleSteps(data);
  // The URL (`buoc`) drives the step when it is visible and reachable, so hardware back returns to the previous one;
  // otherwise the saved step, pulled back to the first earlier step that is no longer valid.
  const urlStep = Number.parseInt(params.get('buoc') ?? '', 10);
  const urlStepOk = steps.includes(urlStep as StepNumber) && resolveStep(urlStep, data, ctx) === urlStep;
  const step: StepNumber = urlStepOk ? (urlStep as StepNumber) : resolveStep(draft.step, data, ctx);
  const index = steps.indexOf(step);
  const schedule = scheduleOf(data);
  const targetDate = resolveTargetDate(data, today);

  useEffect(() => {
    if (discarded && !discardedToast.current) {
      discardedToast.current = true;
      toast.show({ tone: 'info', message: 'Bản nháp cũ không dùng được nữa, mình bắt đầu lại từ đầu nhé.' });
    }
  }, [discarded, toast]);

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  // Keep the saved draft and the URL in line with the step actually shown (mount, popstate, corrections).
  useEffect(() => {
    if (!ready) return;
    goTo(step);
    if (params.get('buoc') !== String(step)) setParams({ ...Object.fromEntries(params), buoc: String(step) }, { replace: true });
  }, [ready, step, params, goTo, setParams]);

  const input = useMemo(() => {
    const parsed = createPathSchema.safeParse({
      language: data.language,
      startPoint: data.startPoint,
      goalType: data.goalType,
      currentLevel: data.currentLevel,
      targetLevel: data.targetLevel,
      weeklyMinutes: schedule.weeklyMinutes,
      targetDate,
    });
    return parsed;
  }, [data, schedule.weeklyMinutes, targetDate]);

  const estimate = useMemo(() => {
    if (!input.success || !reference.data) return null;
    try {
      return estimatePath({ ...input.data, today }, reference.data[input.data.language]);
    } catch {
      return null;
    }
  }, [input, reference.data, today]);

  if (paths.status === 'loading') return <FullScreenLoader />;
  if (paths.status === 'error') {
    return (
      <main id="main" className="mx-auto max-w-md px-safe py-10">
        <ErrorState title="Không tải được lộ trình" onRetry={paths.reload} />
      </main>
    );
  }
  if (created) return <OnboardingCelebration path={created} onDone={() => navigate('/app', { replace: true })} />;

  /** Pushes a history entry so the hardware/swipe back gesture returns to the previous step. */
  const go = (to: StepNumber) => {
    setCreateError(null);
    setPathExists(false);
    goTo(to);
    setParams({ ...Object.fromEntries(params), buoc: String(to) });
  };
  const goNext = () => {
    const nextStep = steps[index + 1];
    if (nextStep) go(nextStep);
  };
  const goBack = () => {
    const prev = steps[index - 1];
    if (prev) go(prev);
    else navigate('/app');
  };

  async function create() {
    if (creatingRef.current) return;
    creatingRef.current = true;
    try {
      if (!input.success) {
        setCreateError(Object.values(fieldErrors(input.error))[0] ?? 'Thông tin chưa hợp lệ.');
        return;
      }
      setCreating(true);
      setCreateError(null);
      setPathExists(false);
      const path = await createPath(requireSupabase(), input.data);
      paths.upsertPath(path, { makeCurrent: true });
      clear();
      setCreated(path);
      track('onboarding_completed', { language: path.language, start_point: path.startPoint, goal_type: path.goalType });
    } catch (error) {
      setCreateError(learningPathErrorMessage(error));
      if (error && typeof error === 'object' && 'message' in error && error.message === 'path_exists_for_language') {
        setPathExists(true);
        paths.reload();
      }
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  let body: ReactNode = null;
  if (step === 1) {
    body = (
      <StepLanguage
        value={data.language && taken.includes(data.language) ? undefined : data.language}
        taken={taken}
        onChange={(language) => {
          if (language !== data.language) {
            update({ language, startPoint: undefined, currentLevel: undefined, goalType: undefined, targetLevel: undefined });
          }
        }}
      />
    );
  } else if (step === 2 && data.language) {
    const language = data.language;
    body = (
      <StepStartPoint
        value={data.startPoint}
        onChange={(startPoint) => {
          const suggested = suggestedCurrentLevel(language, startPoint);
          const keep = data.currentLevel && isLevelAvailable(language, data.currentLevel) ? data.currentLevel : undefined;
          update({ startPoint, currentLevel: startPoint === 'new' ? (suggested ?? undefined) : (keep ?? suggested ?? undefined) });
        }}
      />
    );
  } else if (step === 3 && data.language) {
    const language = data.language;
    body = (
      <StepCurrentLevel
        language={language}
        value={data.currentLevel}
        onChange={(currentLevel) =>
          update({ currentLevel, targetLevel: data.goalType ? (defaultTarget(language, data.goalType, currentLevel) ?? undefined) : undefined })
        }
      />
    );
  } else if (step === 4 && data.language && data.currentLevel) {
    const { language, currentLevel } = data;
    body = (
      <StepGoal
        language={language}
        currentLevel={currentLevel}
        goalType={data.goalType}
        targetLevel={data.targetLevel}
        onGoal={(goalType) => update({ goalType, targetLevel: defaultTarget(language, goalType, currentLevel) ?? undefined })}
        onTarget={(targetLevel) => update({ targetLevel })}
      />
    );
  } else if (step === 5) {
    body = (
      <StepSchedule
        schedule={schedule}
        onSchedule={(v) => update({ schedulePreset: v.preset, weeklyMinutes: v.weeklyMinutes })}
        mode={data.deadlineMode ?? 'none'}
        onMode={(deadlineMode) => update({ deadlineMode })}
        targetDate={data.targetDate}
        onTargetDate={(iso) => update({ targetDate: iso })}
        amount={data.deadlineAmount}
        onAmount={(deadlineAmount) => update({ deadlineAmount })}
        today={today}
      />
    );
  } else if (step === 6) {
    body = input.success ? (
      <StepReview
        input={input.data}
        estimate={estimate}
        today={today}
        onEdit={go}
        onApplyMinutes={(minutes) => {
          const week = schedule.weeklyMinutes.map((m) => (m > 0 ? minutes : 0));
          update({ schedulePreset: presetFromWeek(week), weeklyMinutes: week });
        }}
        onApplyDate={(iso) => update({ deadlineMode: 'date', targetDate: iso })}
        onCreate={() => void create()}
        creating={creating}
        error={createError}
        errorAction={
          pathExists ? (
            <Link to="/app" className={buttonClasses('ghost')}>
              Về trang chủ
            </Link>
          ) : undefined
        }
      />
    ) : (
      <ErrorState title="Thông tin chưa đầy đủ" description="Hãy quay lại các bước trước để hoàn tất." onRetry={() => go(1)} retryLabel="Về bước 1" />
    );
  }

  if (step >= 3 && reference.status === 'error') {
    body = <ErrorState title="Không tải được bảng trình độ" onRetry={reference.retry} />;
  } else if (step >= 3 && reference.status === 'loading') {
    body = (
      <div role="status" className="flex items-center gap-3 py-6 text-muted">
        <Spinner className="size-5 text-primary" />
        <span>Đang tải bảng trình độ…</span>
      </div>
    );
  }

  const availableCodes = LANGUAGE_CODES.filter((code) => LANGUAGES[code].available);
  const allTaken = availableCodes.length > 0 && availableCodes.every((code) => taken.includes(code));

  const valid = isStepValid(step, data, { taken, today }) && !(step >= 3 && reference.status !== 'ready');
  const hint = stepHint(step, valid, reference.status === 'ready');

  return (
    <div className="flex min-h-hero flex-col bg-bg">
      <header className="pt-safe min-[1024px]:border-b min-[1024px]:border-[var(--hairline)]">
        <div className="mx-auto flex h-16 w-full max-w-xl min-[1024px]:max-w-[42rem] items-center gap-2 px-safe">
          {index > 0 || paths.paths.length > 0 ? (
            <button
              type="button"
              onClick={goBack}
              aria-label="Quay lại"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-text/5"
            >
              <ArrowLeft aria-hidden className="size-5" />
            </button>
          ) : (
            <span aria-hidden="true" className="size-11 shrink-0" />
          )}
          <OnboardingProgress current={index + 1} total={steps.length} />
          {paths.paths.length > 0 ? (
            <Link to="/app" aria-label="Thoát tạo lộ trình" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-text/5">
              <X aria-hidden className="size-5" />
            </Link>
          ) : (
            <span aria-hidden="true" className="size-11 shrink-0" />
          )}
        </div>
      </header>
      <main
        id="main"
        className={cn(
          'mx-auto w-full max-w-xl min-[1024px]:max-w-[42rem] flex-1 px-safe pt-3 min-[1024px]:pt-10',
          // Room for the fixed Continue footer; the review step has its own in-flow CTA instead.
          step === 6 ? 'pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))]' : 'pb-[calc(9rem+env(safe-area-inset-bottom,0px))]',
        )}
      >
        <p className="eyebrow tabular-nums">
          Bước {index + 1}/{steps.length}
        </p>
        <h1
          id="onboarding-title"
          ref={titleRef}
          tabIndex={-1}
          className="mt-2 font-display text-[clamp(34px,10vw,44px)] min-[1024px]:text-[52px] font-extrabold uppercase leading-[1.1] focus:outline-none"
        >
          {TITLES[step]}
        </h1>
        <div key={step} className="reveal mt-6">{body}</div>
      </main>
      {step !== 6 && (
        <footer className="fixed inset-x-0 bottom-0 z-30 bg-bg pb-safe before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-8 before:bg-gradient-to-t before:from-bg before:to-transparent">
          <div className="mx-auto w-full max-w-xl min-[1024px]:max-w-[42rem] px-safe pt-3 pb-4">
            {step === 1 && allTaken ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[15px] text-muted">Bạn đã có lộ trình cho mọi ngôn ngữ hiện có.</p>
                <Link to="/app" className={buttonClasses('accent', 'md')}>
                  Về trang chủ
                </Link>
              </div>
            ) : (
              <>
                {hint && (
                  <p id="onboarding-next-hint" className="mb-2 text-center text-sm text-muted">
                    {hint}
                  </p>
                )}
                <Button
                  variant="accent"
                  size="lg"
                  block
                  disabled={!valid}
                  aria-describedby={hint ? 'onboarding-next-hint' : undefined}
                  onClick={goNext}
                >
                  Tiếp tục
                </Button>
              </>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
