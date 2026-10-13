import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  createPathSchema,
  defaultTarget,
  DEFAULT_TIMEZONE,
  estimatePath,
  fieldErrors,
  isLevelOf,
  LANGUAGE_CODES,
  suggestedCurrentLevel,
  type LanguageCode,
} from '@linguo/shared';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { presetFromWeek } from '@/features/learning-paths/components/schedule';
import { learningPathErrorMessage } from '@/features/learning-paths/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { createPath, type LearningPath } from '@/features/learning-paths/service';
import { useReferenceHours } from '@/features/learning-paths/useReferenceHours';
import { useProfile } from '@/features/profile/ProfileProvider';
import { todayIso } from '@/lib/dates';
import { requireSupabase } from '@/lib/supabase';
import { isStepValid, resolveTargetDate, scheduleOf, visibleSteps, type StepNumber } from './logic';
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
  const [params] = useSearchParams();
  const langParam = params.get('lang');
  const initialLanguage = (LANGUAGE_CODES as readonly string[]).includes(langParam ?? '') ? (langParam as LanguageCode) : undefined;
  const { draft, discarded, update, goTo, clear } = useOnboardingDraft(initialLanguage);
  const paths = useLearningPaths();
  const { profile } = useProfile();
  const reference = useReferenceHours();
  const toast = useToast();
  const navigate = useNavigate();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<LearningPath | null>(null);

  const today = todayIso(profile?.timezone ?? DEFAULT_TIMEZONE);
  const data = draft.data;
  const taken = paths.paths.map((p) => p.language);
  const steps = visibleSteps(data);
  const step: StepNumber = steps.includes(draft.step as StepNumber) ? (draft.step as StepNumber) : (steps.find((s) => s > draft.step) ?? 1);
  const index = steps.indexOf(step);
  const schedule = scheduleOf(data);
  const targetDate = resolveTargetDate(data, today);

  useEffect(() => {
    if (discarded) toast.show({ tone: 'info', message: 'Bản nháp cũ không dùng được nữa, mình bắt đầu lại từ đầu nhé.' });
  }, [discarded, toast]);

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

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

  const goNext = () => {
    const nextStep = steps[index + 1];
    if (nextStep) goTo(nextStep);
  };
  const goBack = () => {
    const prev = steps[index - 1];
    if (prev) goTo(prev);
    else navigate(paths.paths.length > 0 ? '/app' : '/', { replace: false });
  };

  async function create() {
    if (!input.success) {
      setCreateError(Object.values(fieldErrors(input.error))[0] ?? 'Thông tin chưa hợp lệ.');
      return;
    }
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const path = await createPath(requireSupabase(), input.data);
      paths.upsertPath(path, { makeCurrent: true });
      clear();
      setCreated(path);
    } catch (error) {
      setCreateError(learningPathErrorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  let body: ReactNode = null;
  if (step === 1) {
    body = (
      <StepLanguage
        value={data.language}
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
          const keep = data.currentLevel && isLevelOf(language, data.currentLevel) ? data.currentLevel : undefined;
          update({ startPoint, currentLevel: startPoint === 'new' ? (suggested ?? undefined) : (keep ?? suggested ?? undefined) });
        }}
      />
    );
  } else if (step === 3 && data.language) {
    body = (
      <StepCurrentLevel
        language={data.language}
        value={data.currentLevel}
        onChange={(currentLevel) => update({ currentLevel, targetLevel: undefined, goalType: data.goalType })}
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
        onEdit={goTo}
        onApplyMinutes={(minutes) => {
          const week = schedule.weeklyMinutes.map((m) => (m > 0 ? minutes : 0));
          update({ schedulePreset: presetFromWeek(week), weeklyMinutes: week });
        }}
        onApplyDate={(iso) => update({ deadlineMode: 'date', targetDate: iso })}
        onCreate={() => void create()}
        creating={creating}
        error={createError}
      />
    ) : (
      <ErrorState title="Thông tin chưa đầy đủ" description="Hãy quay lại các bước trước để hoàn tất." onRetry={() => goTo(1)} retryLabel="Về bước 1" />
    );
  }

  if (reference.status === 'error' && step >= 3) {
    body = <ErrorState title="Không tải được bảng trình độ" onRetry={reference.retry} />;
  }

  const valid = isStepValid(step, data, { taken, today }) && !(step >= 3 && reference.status !== 'ready');

  return (
    <div className="flex min-h-hero flex-col bg-bg">
      <header className="pt-safe">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center gap-2 px-safe">
          <button
            type="button"
            onClick={goBack}
            aria-label="Quay lại"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-text/5"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </button>
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
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-safe pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-3">
        <p className="text-sm text-muted">
          Bước {index + 1}/{steps.length}
        </p>
        <h1 id="onboarding-title" ref={titleRef} tabIndex={-1} className="mt-1 text-[26px] font-bold leading-tight tracking-[-0.03em] focus:outline-none">
          {TITLES[step]}
        </h1>
        <div className="mt-5">{body}</div>
      </main>
      {step !== 6 && (
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-solid/95 pb-safe backdrop-blur-md">
          <div className="mx-auto w-full max-w-xl px-safe py-3">
            <Button variant="accent" size="lg" block disabled={!valid} onClick={goNext}>
              Tiếp tục
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
