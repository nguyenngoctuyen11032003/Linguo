import { useEffect, useId, useRef, useState } from 'react';
import { Compass, FileQuestion, X } from 'lucide-react';
import { Link } from 'react-router';
import { EXAM_FAMILIES, type ExamFamily, type ExamFormSummary, type ExamMode, type ExamSection } from '@linguo/shared';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useExamForms } from '@/features/exam/useExamForms';
import { useExamHistory } from '@/features/exam/useExamHistory';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { cn } from '@/lib/cn';
import { ExamFormCard, ExamHistoryList, FAMILY_LABELS, QuestionTypePicker } from './components';
import { goalFamily, structureWarning } from './exam-page-utils';
import { useStartExam } from './useStartExam';

type Filter = ExamFamily | 'all';

const HISTORY_LIMIT = 5;

function LoadingForms() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Đang tải đề luyện thi…</span>
      <Skeleton className="block h-10 w-56 rounded-full" />
      <Skeleton className="block h-72 w-full rounded-3xl" />
      <Skeleton className="block h-72 w-full rounded-3xl" />
    </div>
  );
}

/** /app/luyen-thi: simulated practice forms of the current path's language, the three modes and recent attempts. */
export function ExamHubPage() {
  const paths = useLearningPaths();
  const path = paths.current;
  const forms = useExamForms(path?.language ?? null);
  const history = useExamHistory(path?.id ?? null, HISTORY_LIMIT);
  const starter = useStartExam();
  const [chosen, setChosen] = useState<Filter | null>(null);
  const [pickerFormId, setPickerFormId] = useState<string | null>(null);

  let content;
  if (!path) {
    if (paths.status === 'loading') content = <LoadingForms />;
    else if (paths.status === 'error') content = <ErrorState title="Không tải được lộ trình" onRetry={paths.reload} />;
    else {
      content = (
        <EmptyState
          icon={Compass}
          title="Bạn chưa có lộ trình"
          description="Tạo lộ trình để Linguo gợi ý đề luyện thi đúng ngôn ngữ và mục tiêu của bạn."
          action={
            <Link to="/app/bat-dau" className={buttonClasses('accent')}>
              Tạo lộ trình
            </Link>
          }
        />
      );
    }
  } else if (forms.status === 'loading' || forms.status === 'idle') {
    content = <LoadingForms />;
  } else if (forms.status === 'error') {
    content = <ErrorState title="Không tải được đề luyện thi" description={forms.error ?? undefined} onRetry={forms.reload} />;
  } else if (forms.forms.length === 0) {
    content = (
      <EmptyState
        icon={FileQuestion}
        title="Chưa có đề luyện thi"
        description="Đề luyện cho ngôn ngữ của lộ trình này đang được biên soạn. Hãy quay lại sau nhé."
      />
    );
  } else {
    const families = EXAM_FAMILIES.filter((f) => forms.forms.some((form) => form.family === f));
    const preferred = goalFamily(path.goalType);
    const fallback: Filter = preferred && families.includes(preferred) ? preferred : 'all';
    const filter: Filter = chosen !== null && (chosen === 'all' || families.includes(chosen)) ? chosen : fallback;
    const visible = forms.forms.filter((f) => filter === 'all' || f.family === filter);

    const start = (form: ExamFormSummary, mode: ExamMode, section?: ExamSection, questionType?: string) => {
      void starter.start({
        pathId: path.id,
        formId: form.form_id,
        family: form.family,
        mode,
        section: section ?? null,
        questionType: questionType ?? null,
      });
    };

    content = (
      <div className="space-y-4">
        {families.length > 1 && <FamilyFilter families={families} value={filter} onChange={setChosen} />}
        {starter.error && (
          <p role="alert" className="rounded-2xl border border-error/50 bg-error/10 px-4 py-3 text-[15px] text-error-text">
            {starter.error}
          </p>
        )}
        <ul className="grid gap-4 lg:grid-cols-2">
          {visible.map((form) => (
            <li key={form.form_id} className="min-w-0 space-y-3">
              <ExamFormCard
                form={form}
                warningVi={structureWarning(path.goalType, form.family)}
                busy={starter.busy}
                onStart={(mode, section) => {
                  if (mode === 'question_type') {
                    starter.clearError();
                    setPickerFormId(form.form_id);
                    return;
                  }
                  start(form, mode, section);
                }}
              />
              {pickerFormId === form.form_id && (
                <PickerPanel form={form} busy={starter.busy} onClose={() => setPickerFormId(null)} onPick={(type) => start(form, 'question_type', undefined, type)} />
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Luyện thi</h1>
        <p className="text-[15px] text-muted">Bài luyện mô phỏng theo cấu trúc đề thi — không phải đề thi chính thức.</p>
      </div>
      {content}
      {path && <HistorySection status={history.status} entries={history.entries} error={history.error} reload={history.reload} />}
    </div>
  );
}

function FamilyFilter({ families, value, onChange }: { families: readonly ExamFamily[]; value: Filter; onChange(f: Filter): void }) {
  const name = useId();
  const options: Array<{ value: Filter; label: string }> = [{ value: 'all', label: 'Tất cả' }, ...families.map((f) => ({ value: f, label: FAMILY_LABELS[f] }))];
  return (
    <div role="radiogroup" aria-label="Lọc theo loại đề" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className="relative">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full focus-visible:outline-none"
          />
          <span
            className={cn(
              'pointer-events-none inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-semibold transition-colors',
              'peer-focus-visible:ring-4 peer-focus-visible:ring-primary/40',
              value === o.value ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface-solid text-text',
            )}
          >
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function PickerPanel({ form, busy, onPick, onClose }: { form: ExamFormSummary; busy: boolean; onPick(type: string): void; onClose(): void }) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <SolidCard className="min-w-0">
      <section ref={ref} tabIndex={-1} aria-labelledby={titleId} aria-busy={busy || undefined} className="space-y-3 focus:outline-none">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="min-w-0 text-lg font-bold break-words">
            Chọn dạng câu — {form.title_vi}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng danh sách dạng câu"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-text/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <fieldset disabled={busy} className="min-w-0">
          <QuestionTypePicker form={form} onPick={onPick} />
        </fieldset>
      </section>
    </SolidCard>
  );
}

function HistorySection({ status, entries, error, reload }: ReturnType<typeof useExamHistory>) {
  return (
    <section aria-labelledby="exam-history-title" className="space-y-3">
      <h2 id="exam-history-title" className="text-xl font-bold tracking-[-0.02em]">
        Lịch sử thi gần đây
      </h2>
      {status === 'error' ? (
        <ErrorState title="Không tải được lịch sử thi" description={error ?? undefined} onRetry={reload} headingLevel="h3" />
      ) : status === 'ready' ? (
        <ExamHistoryList entries={entries} />
      ) : (
        <div role="status">
          <span className="sr-only">Đang tải lịch sử thi…</span>
          <Skeleton className="block h-16 w-full rounded-2xl" />
        </div>
      )}
    </section>
  );
}
