import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Clock, HelpCircle, Pause, PauseCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import { m as motion } from 'motion/react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { DiagnosticItem, DiagnosticMode, DiagnosticSkill } from '@linguo/shared';
import { ChoiceGroup } from '@/components/exercise/ChoiceGroup';
import { ReportContentButton } from '@/components/report';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { functionalTransition } from '@/design/motion';
import { track } from '@/features/analytics';
import { useDiagnosticRun } from '@/features/diagnostic/useDiagnosticRun';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { formatDate, FOUNDATION_MODE_VALUE, MODE_PARAM, SKILL_LABELS, type SkipReason } from './labels';
import { SkillProgress } from './SkillProgress';
import { SkipSkillSheet } from './SkipSkillSheet';
import { GENERIC_ERROR_MESSAGE } from '@/lib/error-fallback';

const HOME = '/app';

const reportPath = (pathId: string) => `/app/kiem-tra/${pathId}/ket-qua`;

/** A timestamp later than now; false for null or an unparseable value. */
function isFuture(iso: string | null): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return !Number.isNaN(time) && time > Date.now();
}

function Shell({ header, children, footer }: { header: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {header}
      <main
        id="main"
        className="mx-auto w-full max-w-xl flex-1 px-safe pb-[calc(9rem+env(safe-area-inset-bottom,0px))] pt-3 text-[17px] leading-relaxed"
      >
        {children}
      </main>
      {footer && (
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-solid/95 pb-safe backdrop-blur-md">
          <div className="mx-auto w-full max-w-xl px-safe py-3">{footer}</div>
        </footer>
      )}
    </div>
  );
}

interface IntroProps {
  mode: DiagnosticMode;
  resumable: boolean;
  retakeAfter: string | null;
}

function Intro({ mode, resumable, retakeAfter }: IntroProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const foundation = mode === 'foundation';
  const points = [
    {
      icon: Clock,
      text: foundation ? 'Khoảng 2–3 phút, không tính giờ.' : 'Khoảng 12 phút, không tính giờ.',
    },
    {
      icon: Sparkles,
      text: 'Câu hỏi sẽ dễ hoặc khó hơn tùy câu trả lời — sai là bình thường.',
    },
    {
      icon: HelpCircle,
      text: 'Không chắc thì chọn “Tôi không biết” thay vì đoán, kết quả sẽ sát hơn.',
    },
    {
      icon: PauseCircle,
      text: 'Bạn có thể tạm dừng bất cứ lúc nào và làm tiếp sau.',
    },
    {
      icon: ShieldCheck,
      text: 'Bài gồm từ vựng, ngữ pháp và đọc hiểu; chưa đánh giá nghe, viết, nói. Trình độ lộ trình chỉ thay đổi khi bạn đồng ý.',
    },
  ];
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="text-[26px] font-bold leading-tight tracking-[-0.03em] focus:outline-none">
        {foundation ? 'Kiểm tra nền tảng' : 'Kiểm tra trình độ'}
      </h1>
      <p className="mt-2 text-muted">Giúp Linguo chọn bài học vừa sức với bạn.</p>
      {resumable && (
        <p className="mt-4 rounded-2xl bg-primary/10 p-3 text-[15px]">
          Bạn đang làm dở bài kiểm tra. Các câu đã trả lời được giữ lại, bạn sẽ làm tiếp từ câu đang dừng.
        </p>
      )}
      {!resumable && retakeAfter && (
        <p className="mt-4 rounded-2xl bg-text/5 p-3 text-[15px]">Bạn có thể làm lại bài kiểm tra từ ngày {formatDate(retakeAfter)}.</p>
      )}
      <ul className="mt-6 space-y-4">
        {points.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-3">
            <Icon aria-hidden className="mt-0.5 size-6 shrink-0 text-primary" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

interface QuestionProps {
  item: DiagnosticItem;
  pathLanguage: string | undefined;
  busy: boolean;
  nearEnd: boolean;
  onAnswer: (choice: string | null) => void;
  onOpenSkip: () => void;
  skipTriggerRef: RefObject<HTMLButtonElement | null>;
}

/** One question per screen; remounted per item so the selection resets and the heading takes focus. */
function Question({ item, pathLanguage, busy, nearEnd, onAnswer, onOpenSkip, skipTriggerRef }: QuestionProps) {
  const { reduceMotion } = useMotionPrefs();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stemId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const { prompt } = item;
  const passageLang = pathLanguage ?? prompt.options[0]?.lang ?? prompt.stem_lang;

  return (
    <>
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={functionalTransition}
      >
        <h1 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-muted focus:outline-none">
          {SKILL_LABELS[item.skill]}
          {nearEnd && <span className="font-normal"> · Sắp xong</span>}
        </h1>
        {prompt.passage && (
          <section aria-label="Đoạn văn" className="mt-3 rounded-2xl border border-border bg-surface-solid p-4">
            <p lang={passageLang} className="whitespace-pre-line text-[17px] leading-relaxed">
              {prompt.passage}
            </p>
          </section>
        )}
        <p id={stemId} lang={prompt.stem_lang} className="mt-3 text-[20px] font-semibold leading-snug">
          {prompt.stem}
        </p>
        <div className="mt-5">
          <ChoiceGroup labelledBy={stemId} options={prompt.options} selectedId={selected} onSelect={setSelected} disabled={busy} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            ref={skipTriggerRef}
            type="button"
            onClick={onOpenSkip}
            disabled={busy}
            className="inline-flex min-h-11 items-center rounded-full px-2 text-[15px] font-semibold text-muted underline underline-offset-4 hover:text-text disabled:opacity-60"
          >
            Bỏ qua kỹ năng này
          </button>
          {/* The report has no per-question review, so each question is reportable while it is on screen (spec 11 §2). */}
          <ReportContentButton targetKind="assessment_item" targetId={item.id} />
        </div>
      </motion.div>
      {/* Outside the animated block: a transformed ancestor would break `position: fixed`. */}
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-solid/95 pb-safe backdrop-blur-md">
        {/* Below 360 px the buttons stack (primary on top) so "Tiếp tục" never wraps beside the ghost one. */}
        <div className="mx-auto flex w-full max-w-xl flex-col-reverse gap-2 px-safe py-3 min-[360px]:flex-row min-[360px]:gap-3">
          <Button
            variant="ghost"
            size="lg"
            disabled={busy}
            onClick={() => onAnswer(null)}
            className="w-full min-[360px]:w-auto min-[360px]:shrink-0"
          >
            Tôi không biết
          </Button>
          <div className="min-[360px]:flex-1">
            <Button
              variant="accent"
              size="lg"
              block
              disabled={!selected}
              loading={busy && selected !== null}
              onClick={() => onAnswer(selected)}
            >
              Tiếp tục
            </Button>
          </div>
        </div>
      </footer>
    </>
  );
}

/** Full-screen adaptive placement test at /app/kiem-tra/:pathId (outside AppLayout, like the lesson player). */
export function DiagnosticPage() {
  const { pathId = '' } = useParams();
  const [params] = useSearchParams();
  const requestedMode: DiagnosticMode = params.get(MODE_PARAM) === FOUNDATION_MODE_VALUE ? 'foundation' : 'full';
  const run = useDiagnosticRun(pathId, { mode: requestedMode });
  const { paths } = useLearningPaths();
  const navigate = useNavigate();
  const [skipOpen, setSkipOpen] = useState(false);
  const skipTriggerRef = useRef<HTMLButtonElement>(null);
  const { status, item, progress, report } = run;
  const path = paths.find((p) => p.id === pathId);

  // Analytics: a report reached after answering here is a completion; reopening a finished attempt is not.
  const answeredHere = useRef(false);
  useEffect(() => {
    if (status === 'question') answeredHere.current = true;
    if (status === 'report' && answeredHere.current) {
      answeredHere.current = false;
      track('diagnostic_completed', { mode: report?.mode ?? requestedMode });
    }
  }, [status, report, requestedMode]);

  useEffect(() => {
    if (status === 'report') navigate(reportPath(pathId), { replace: true, state: { report } });
  }, [status, report, pathId, navigate]);

  const inTest = status === 'question' || status === 'submitting';

  const pause = () => {
    // Answers are already on the server; the next visit resumes at the pending item.
    run.pause();
    navigate(HOME);
  };

  const header = (
    <header className="pt-safe">
      <div className="mx-auto flex min-h-14 w-full max-w-xl flex-wrap items-center gap-x-3 gap-y-1 px-safe py-2">
        {inTest ? (
          <button
            type="button"
            onClick={pause}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold hover:bg-text/5"
          >
            <Pause aria-hidden className="size-4" />
            Tạm dừng
          </button>
        ) : (
          <Link
            to={HOME}
            aria-label="Đóng bài kiểm tra"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-text/5"
          >
            <X aria-hidden className="size-5" />
          </Link>
        )}
        {inTest && progress ? <SkillProgress progress={progress} /> : <span className="flex-1" />}
      </div>
    </header>
  );

  if (status === 'loading' || status === 'finishing' || status === 'report') {
    const label = status === 'loading' ? 'Đang tải bài kiểm tra…' : 'Đang tính kết quả…';
    return (
      <Shell header={header}>
        <h1 className="sr-only">Kiểm tra trình độ</h1>
        <div role="status" className="space-y-4">
          <span className={status === 'loading' ? 'sr-only' : 'text-muted'}>{label}</span>
          <Skeleton className="block h-8 w-2/3" />
          <Skeleton className="block h-24 w-full rounded-2xl" />
          <Skeleton className="block h-24 w-full rounded-2xl" />
        </div>
      </Shell>
    );
  }

  if (status === 'error') {
    return (
      <Shell header={header}>
        <h1 className="sr-only">Kiểm tra trình độ</h1>
        <div className="space-y-4">
          <ErrorState
            title="Không tiếp tục được bài kiểm tra"
            description={run.error ?? GENERIC_ERROR_MESSAGE}
            onRetry={run.retry}
          />
          <Link to={HOME} className={buttonClasses('ghost', 'md', true)}>
            Về trang chủ
          </Link>
        </div>
      </Shell>
    );
  }

  if (status === 'intro' || !item) {
    const introMode = run.mode ?? requestedMode;
    // diagnostic_status's retake date describes the full test (a foundation check has its own cooldown): while it
    // is in the future, start_diagnostic would only answer `diagnostic_cooldown`, so no "Bắt đầu" that cannot work.
    const coolingDown = !run.resumable && introMode === 'full' && isFuture(run.retakeAfter);
    return (
      <Shell
        header={header}
        footer={
          coolingDown ? (
            <Link to={HOME} className={buttonClasses('accent', 'lg', true)}>
              Về trang chủ
            </Link>
          ) : (
            <div className="flex gap-3">
              <Link to={HOME} className={buttonClasses('ghost', 'lg')}>
                Để sau
              </Link>
              <div className="flex-1">
                <Button
                  variant="accent"
                  size="lg"
                  block
                  onClick={() => {
                    track('diagnostic_started', { mode: introMode, resumed: run.resumable });
                    run.start();
                  }}
                >
                  {run.resumable ? 'Làm tiếp' : 'Bắt đầu'}
                </Button>
              </div>
            </div>
          )
        }
      >
        <Intro mode={introMode} resumable={run.resumable} retakeAfter={introMode === 'full' ? run.retakeAfter : null} />
      </Shell>
    );
  }

  const busy = status === 'submitting';
  return (
    <Shell header={header}>
      <Question
        key={item.id}
        item={item}
        pathLanguage={path?.language}
        busy={busy}
        nearEnd={progress?.near_end ?? false}
        onAnswer={(choice) => run.answer(choice)}
        onOpenSkip={() => setSkipOpen(true)}
        skipTriggerRef={skipTriggerRef}
      />
      <SkipSkillSheet
        open={skipOpen}
        skillLabel={SKILL_LABELS[item.skill]}
        last={
          !!progress &&
          !progress.skills.some((row) => row.skill !== item.skill && (row.status === 'pending' || row.status === 'active'))
        }
        busy={busy}
        triggerRef={skipTriggerRef}
        onClose={() => setSkipOpen(false)}
        onSkip={(reason: SkipReason) => {
          const skill: DiagnosticSkill = item.skill;
          setSkipOpen(false);
          run.skip(skill, reason);
        }}
      />
    </Shell>
  );
}
