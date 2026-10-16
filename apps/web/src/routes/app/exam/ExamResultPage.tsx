import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link, Navigate, useLocation, useParams } from 'react-router';
import { examResultSchema, type AiRequestInput, type ExamResult } from '@linguo/shared';
import { AiExplainSheet } from '@/components/ai';
import { buttonClasses } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { QuestionTypeBreakdown, ResultSummary, ReviewList, examRunnerHref } from './components';
import { EXAM_HUB_PATH } from './exam-page-utils';
import { useExamResult } from './useExamResult';
import { useStartExam } from './useStartExam';
import { writingFeedbackRequest } from './writing-feedback';

/** The runner hands the graded result over in the navigation state; anything else there is ignored. */
function resultFromState(state: unknown): ExamResult | null {
  if (!state || typeof state !== 'object' || !('result' in state)) return null;
  const parsed = examResultSchema.safeParse(state.result);
  return parsed.success ? parsed.data : null;
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="glass sticky top-0 z-30 border-x-0! border-t-0! pt-safe">
        <div className="mx-auto flex min-h-14 w-full max-w-3xl items-center gap-2 px-safe py-2">
          <Link
            to={EXAM_HUB_PATH}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-text/5 pr-4 pl-2 text-[15px] font-semibold transition-[background-color,scale] hover:bg-text/10 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            <ChevronLeft aria-hidden className="size-5" />
            Về Luyện thi
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-safe pt-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        <h1 className="page-title">Kết quả bài luyện</h1>
        {children}
      </main>
    </div>
  );
}

/** /app/luyen-thi/ket-qua/:attemptId — scores, weakest question types with drills, and the full review. */
export function ExamResultPage() {
  const { attemptId = '' } = useParams();
  const location = useLocation();
  const handedOver = useMemo(() => resultFromState(location.state), [location.state]);
  const state = useExamResult(attemptId, handedOver);
  const paths = useLearningPaths();
  const starter = useStartExam();
  const [aiRequest, setAiRequest] = useState<AiRequestInput | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const aiTrigger = useRef<HTMLElement | null>(null);

  if (state.status === 'in_progress') return <Navigate to={examRunnerHref(attemptId)} replace />;

  if (state.status === 'loading') {
    return (
      <Page>
        <div role="status" className="space-y-4">
          <span className="sr-only">Đang tải kết quả…</span>
          <Skeleton className="block h-64 w-full rounded-3xl" />
          <Skeleton className="block h-24 w-full rounded-2xl" />
        </div>
      </Page>
    );
  }

  if (state.status === 'error') {
    return (
      <Page>
        <ErrorState title="Không tải được kết quả" description={state.error} onRetry={state.reload} />
        <Link to={EXAM_HUB_PATH} className={buttonClasses('ghost', 'md', true)}>
          Về Luyện thi
        </Link>
      </Page>
    );
  }

  const { result } = state;
  const path = paths.current;
  const drill = (questionType: string) => {
    if (!path) return;
    void starter.start({ pathId: path.id, formId: result.form_id, family: result.family, mode: 'question_type', questionType });
  };

  return (
    <Page>
      <ResultSummary result={result} />

      {result.by_question_type.length > 0 && (
        <section aria-labelledby="exam-breakdown-title" aria-busy={starter.busy || undefined} className="space-y-3">
          <h2 id="exam-breakdown-title" className="text-xl font-extrabold tracking-[-0.02em]">
            Phân tích dạng câu
          </h2>
          <p className="text-sm text-muted">Dạng câu sai nhiều nhất ở trên cùng. Luyện thêm tối đa 10 câu cùng dạng, không tính giờ.</p>
          {starter.error && (
            <p role="alert" className="rounded-2xl bg-error/10 px-4 py-3 text-[15px] text-error-text ring-1 ring-error/40 ring-inset">
              {starter.error}
            </p>
          )}
          {!path && <p className="text-sm text-muted">Chọn một lộ trình để luyện thêm theo dạng câu.</p>}
          <fieldset disabled={starter.busy || !path} className="min-w-0">
            <QuestionTypeBreakdown result={result} onDrill={drill} />
          </fieldset>
        </section>
      )}

      <section aria-labelledby="exam-review-title" className="space-y-3">
        <h2 id="exam-review-title" className="text-xl font-extrabold tracking-[-0.02em]">
          Xem lại đáp án
        </h2>
        <ReviewList
          result={result}
          onAiFeedback={(item, trigger) => {
            const request = writingFeedbackRequest(result, item);
            if (!request) return;
            aiTrigger.current = trigger;
            setAiRequest(request);
            setAiOpen(true);
          }}
        />
      </section>

      <Link to={EXAM_HUB_PATH} className={buttonClasses('ghost', 'lg', true)}>
        Về Luyện thi
      </Link>

      {aiRequest && (
        <AiExplainSheet open={aiOpen} onClose={() => setAiOpen(false)} request={aiRequest} triggerRef={aiTrigger} />
      )}
    </Page>
  );
}
