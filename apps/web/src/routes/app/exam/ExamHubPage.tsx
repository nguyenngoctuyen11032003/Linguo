import { useEffect, useId, useRef, useState } from 'react';
import { Compass, FileQuestion, Users, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { EXAM_FAMILIES, type ExamFamily, type ExamFormSummary, type ExamMode, type ExamSection } from '@linguo/shared';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { OnlineOnlyState } from '@/components/ui/OnlineOnlyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { EXAM_FORM_PARAM, EXAM_MODE_PARAM, EXAM_SECTION_PARAM } from '@/features/classes/labels';
import { useAssignedFormLanguage } from '@/features/exam/useAssignedFormLanguage';
import { useExamForms } from '@/features/exam/useExamForms';
import { useExamHistory } from '@/features/exam/useExamHistory';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { pathForLanguage } from '@/features/learning-paths/path-for-language';
import { cn } from '@/lib/cn';
import { useOnline } from '@/lib/useOnline';
import { ExamFormCard, ExamHistoryList, FAMILY_LABELS, QuestionTypePicker } from './components';
import { fullMockMinutes, goalFamily, structureWarning } from './exam-page-utils';
import { OpenAttemptDialog } from './OpenAttemptDialog';
import { StartExamDialog } from './StartExamDialog';
import { useStartExam } from './useStartExam';

type Filter = ExamFamily | 'all';

/** A start held back by the open-attempt confirmation. */
interface PendingStart {
  formId: string;
  mode: ExamMode;
  section?: ExamSection;
  questionType?: string;
}

const HISTORY_LIMIT = 5;

/** `?de=<exam form id>`: a class assignment ("Làm đề" in /app/lop-hoc) opens the hub on that one form. */
const ASSIGNED_FORM_PARAM = EXAM_FORM_PARAM;

/** What the teacher asked for in the assignment: the whole mock, or one section (`che-do`, `phan`); null = learner picks. */
function readAssignedMode(params: URLSearchParams): { mode: 'full' } | { mode: 'section'; section: ExamSection } | null {
  const mode = params.get(EXAM_MODE_PARAM);
  if (mode === 'full') return { mode: 'full' };
  const section = params.get(EXAM_SECTION_PARAM);
  if (mode === 'section' && (section === 'listening' || section === 'reading' || section === 'writing')) return { mode: 'section', section };
  return null;
}

const SECTION_NAMES: Record<ExamSection, string> = { listening: 'Nghe', reading: 'Đọc', writing: 'Viết' };

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
  const currentPath = paths.current;
  const online = useOnline();
  const [searchParams, setSearchParams] = useSearchParams();
  const assignedFormId = searchParams.get(ASSIGNED_FORM_PARAM)?.trim() || null;
  const assignedMode = readAssignedMode(searchParams);
  // An assigned form of another language than the current path opens on the learner's own path of that language (the
  // current path is left alone); without one the hub says so and keeps the current path's forms.
  const assignedLookup = useAssignedFormLanguage(assignedFormId);
  const otherLanguage = assignedLookup.language !== null && currentPath !== null && assignedLookup.language !== currentPath.language ? assignedLookup.language : null;
  const languagePath = otherLanguage ? pathForLanguage(paths.paths, otherLanguage) : null;
  const missingPathLanguage = otherLanguage !== null && languagePath === null ? otherLanguage : null;
  const path = languagePath ?? currentPath;
  const forms = useExamForms(path?.language ?? null);
  const history = useExamHistory(path?.id ?? null, HISTORY_LIMIT);
  const starter = useStartExam();
  const showAllForms = () =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(ASSIGNED_FORM_PARAM);
        return next;
      },
      { replace: true },
    );
  const [chosen, setChosen] = useState<Filter | null>(null);
  const [pickerFormId, setPickerFormId] = useState<string | null>(null);
  /** A timed full mock waiting for the learner's confirmation: its clock starts the moment the attempt exists. */
  const [confirmFormId, setConfirmFormId] = useState<string | null>(null);
  /** A start that would expire the open attempt, waiting for "Bắt đầu bài mới". */
  const [pending, setPending] = useState<PendingStart | null>(null);
  /** The mode button that asked for a start: focus goes back to it when the confirmation is dismissed. */
  const triggerRef = useRef<HTMLElement | null>(null);
  /** start_exam silently expires the path's open attempt; the history (newest first) lists it as "Đang làm". */
  const openAttempt = history.status === 'ready' ? (history.entries.find((e) => e.status === 'in_progress') ?? null) : null;

  let content;
  if (!online) {
    // Forms, the attempt clock and the grading are all on the server.
    content = <OnlineOnlyState feature="Thi thử" />;
  } else if (!path) {
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
    // The assigned form is only listed when it is published in the language of the current path.
    const assignedForm = assignedFormId ? (forms.forms.find((f) => f.form_id === assignedFormId) ?? null) : null;
    const visible = assignedForm ? [assignedForm] : forms.forms.filter((f) => filter === 'all' || f.family === filter);

    const confirmForm = forms.forms.find((f) => f.form_id === confirmFormId) ?? null;
    /** A start past the open-attempt check: a timed full mock still asks about its clock first. */
    const proceed = (form: ExamFormSummary, mode: ExamMode, section?: ExamSection, questionType?: string) => {
      if (mode === 'full' && fullMockMinutes(form) > 0) {
        starter.clearError();
        setConfirmFormId(form.form_id);
        return;
      }
      start(form, mode, section, questionType);
    };
    const request = (form: ExamFormSummary, mode: ExamMode, section?: ExamSection, questionType?: string) => {
      if (openAttempt) {
        starter.clearError();
        setPending({ formId: form.form_id, mode, section, questionType });
        return;
      }
      proceed(form, mode, section, questionType);
    };
    const pendingForm = pending ? (forms.forms.find((f) => f.form_id === pending.formId) ?? null) : null;
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
        {assignedFormId && (
          <AssignedFormNotice
            form={assignedForm}
            lookingUp={assignedLookup.status === 'loading'}
            missingPathLanguage={missingPathLanguage}
            mode={assignedMode}
            busy={starter.busy}
            onStart={(form, mode, section) => request(form, mode, section)}
            onShowAll={showAllForms}
          />
        )}
        {!assignedForm && families.length > 1 && <FamilyFilter families={families} value={filter} onChange={setChosen} />}
        {starter.error && (
          <p role="alert" className="rounded-2xl bg-error/10 px-4 py-3 text-[15px] text-error-text ring-1 ring-error/40 ring-inset">
            {starter.error}
          </p>
        )}
        <ul className="grid gap-4 lg:grid-cols-2">
          {visible.map((form) => (
            <li
              key={form.form_id}
              className="min-w-0 space-y-3"
              onClickCapture={(e) => {
                const button = e.target instanceof Element ? e.target.closest('button') : null;
                if (button) triggerRef.current = button;
              }}
            >
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
                  request(form, mode, section);
                }}
              />
              {pickerFormId === form.form_id && (
                <PickerPanel form={form} busy={starter.busy} onClose={() => setPickerFormId(null)} onPick={(type) => request(form, 'question_type', undefined, type)} />
              )}
            </li>
          ))}
        </ul>
        <OpenAttemptDialog
          attempt={pendingForm ? openAttempt : null}
          busy={starter.busy}
          triggerRef={triggerRef}
          onCancel={() => setPending(null)}
          onStartNew={() => {
            if (!pending || !pendingForm) return;
            setPending(null);
            proceed(pendingForm, pending.mode, pending.section, pending.questionType);
          }}
        />
        <StartExamDialog
          open={confirmForm !== null}
          minutes={confirmForm ? fullMockMinutes(confirmForm) : 0}
          title={confirmForm?.title_vi}
          busy={starter.busy}
          onCancel={() => setConfirmFormId(null)}
          onConfirm={() => {
            if (!confirmForm) return;
            setConfirmFormId(null);
            start(confirmForm, 'full');
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="page-title">Luyện thi</h1>
        <p className="text-[15px] text-muted">Bài luyện mô phỏng theo cấu trúc đề thi — không phải đề thi chính thức.</p>
      </div>
      {content}
      {path && <HistorySection status={history.status} entries={history.entries} error={history.error} reload={history.reload} />}
    </div>
  );
}

interface AssignedFormNoticeProps {
  /** The assigned form when it is listed for the path in use; null when it is not available. */
  form: ExamFormSummary | null;
  /** The form's language is still being looked up: say nothing yet. */
  lookingUp: boolean;
  /** Language of the form when the learner has no path in it (the hub then shows the current path's forms). */
  missingPathLanguage: string | null;
  mode: ReturnType<typeof readAssignedMode>;
  busy: boolean;
  onStart(form: ExamFormSummary, mode: ExamMode, section?: ExamSection): void;
  onShowAll(): void;
}

const LANGUAGE_NAMES: Record<string, string> = { en: 'tiếng Anh', ko: 'tiếng Hàn', ja: 'tiếng Nhật', de: 'tiếng Đức' };

/**
 * Banner of a hub opened from a class assignment. With the teacher's mode (the whole mock, or one section) it offers
 * that start at once; the learner can still pick another mode below. When the form is not listed (unpublished or
 * removed) or the learner has no path in its language, the learner is told so and every form stays available.
 */
function AssignedFormNotice({ form, lookingUp, missingPathLanguage, mode, busy, onStart, onShowAll }: AssignedFormNoticeProps) {
  if (!form) {
    if (lookingUp) return null;
    if (missingPathLanguage) {
      const name = LANGUAGE_NAMES[missingPathLanguage] ?? 'ngôn ngữ của đề';
      return (
        <p role="status" className="rounded-2xl bg-warn/10 px-4 py-3 text-[15px] ring-1 ring-warn/40 ring-inset">
          Đề giáo viên giao thuộc {name}, nhưng bạn chưa có lộ trình {name}.{' '}
          <Link to={`/app/bat-dau?lang=${missingPathLanguage}`} className="font-semibold underline">
            Tạo lộ trình {name}
          </Link>{' '}
          rồi mở lại bài giao. Bạn vẫn có thể chọn một đề khác bên dưới.
        </p>
      );
    }
    return (
      <p role="status" className="rounded-2xl bg-warn/10 px-4 py-3 text-[15px] ring-1 ring-warn/40 ring-inset">
        Không mở được đề giáo viên giao: đề này đã được gỡ hoặc chưa được xuất bản. Bạn vẫn có thể chọn một đề khác bên dưới.
      </p>
    );
  }
  // The section asked for may not exist any more in the form: then the learner picks.
  const section = mode?.mode === 'section' ? mode.section : null;
  const sectionAvailable = section !== null && form.sections.some((s) => s.section === section && s.question_count > 0);
  const start: { label: string; mode: ExamMode; section?: ExamSection } | null =
    mode?.mode === 'full'
      ? { label: 'Làm trọn đề', mode: 'full' }
      : section && sectionAvailable
        ? { label: `Làm phần ${SECTION_NAMES[section]}`, mode: 'section', section }
        : null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-primary/8 px-4 py-3 ring-1 ring-primary/20 ring-inset sm:flex-row sm:items-center">
      <p className="flex min-w-0 flex-1 items-start gap-2 text-[15px]">
        <Users aria-hidden strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-primary" />
        <span>
          {start ? `Đề giáo viên giao cho bạn, yêu cầu: ${start.label.toLowerCase()}. Bấm nút bên cạnh để bắt đầu; bạn vẫn chọn được cách khác bên dưới nhưng chỉ cách giáo viên chọn được tính vào bài giao.` : 'Đề giáo viên giao cho bạn. Chọn một chế độ để bắt đầu.'}
        </span>
      </p>
      <div className="flex flex-wrap gap-2 self-start sm:self-auto sm:shrink-0">
        {start && (
          <button type="button" disabled={busy} onClick={() => onStart(form, start.mode, start.section)} className={buttonClasses('primary', 'md')}>
            {start.label}
          </button>
        )}
        <button type="button" onClick={onShowAll} className={buttonClasses('ghost', 'md')}>
          Xem tất cả đề
        </button>
      </div>
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
              'pointer-events-none inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-bold transition-[background-color,color,scale] peer-active:scale-95',
              'peer-focus-visible:ring-4 peer-focus-visible:ring-primary/40',
              value === o.value ? 'press-primary border-primary bg-primary text-on-primary' : 'border-border bg-text/[0.03] text-text',
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
      <h2 id="exam-history-title" className="text-xl font-extrabold tracking-[-0.02em]">
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
