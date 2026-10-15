import { useId, useMemo, useState, type FormEvent, type RefObject } from 'react';
import { ASSIGNMENT_KINDS, TEACHER_LIMITS as L, type AssignmentKind, type ClassLanguage, type CreateAssignmentInput } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input, inputClasses } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { teacherErrorMessage } from '@/features/teacher/error-map';
import { ASSIGNMENT_KIND_LABELS, CLASS_LANGUAGE_LABELS, dueDayToIso, isDueDayAllowed, localDateInput } from '@/features/teacher/format';
import type { CatalogLesson } from '@/features/teacher/service';
import { useTeacherCatalog } from '@/features/teacher/useTeacherCatalog';
import { cn } from '@/lib/cn';
import { VocabDialog as Dialog } from '@/routes/app/vocab/VocabDialog';

export interface AssignmentDialogProps {
  open: boolean;
  language: ClassLanguage;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSubmit: (input: CreateAssignmentInput) => Promise<void>;
}

const KIND_HINTS: Record<AssignmentKind, string> = {
  lesson: 'Học viên hoàn thành một bài trong lộ trình.',
  exam: 'Học viên nộp một lượt làm đề luyện thi.',
  review: 'Học viên chấm đủ số thẻ ôn tập của ngôn ngữ này.',
};

/** Give the class a lesson, an exam form (from the catalog of the class language) or a number of reviews. */
export function AssignmentDialog({ open, language, triggerRef, onClose, onSubmit }: AssignmentDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      title="Giao bài cho lớp"
      description={`Chọn nội dung ${CLASS_LANGUAGE_LABELS[language].toLowerCase()} và hạn hoàn thành.`}
    >
      <AssignmentForm language={language} onClose={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

function groupLessons(lessons: CatalogLesson[]): Array<[string, CatalogLesson[]]> {
  const groups = new Map<string, CatalogLesson[]>();
  for (const lesson of lessons) {
    const list = groups.get(lesson.group);
    if (list) list.push(lesson);
    else groups.set(lesson.group, [lesson]);
  }
  return [...groups.entries()];
}

function AssignmentForm({ language, onClose, onSubmit }: Pick<AssignmentDialogProps, 'language' | 'onClose' | 'onSubmit'>) {
  const catalog = useTeacherCatalog(language, true);
  const [kind, setKind] = useState<AssignmentKind>('lesson');
  const [refId, setRefId] = useState('');
  const [target, setTarget] = useState('20');
  const [dueDay, setDueDay] = useState('');
  const [note, setNote] = useState('');
  const [fieldError, setFieldError] = useState<{ ref?: string; target?: string; due?: string; note?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kindLabelId = useId();

  const today = useMemo(() => new Date(), []);
  const minDay = localDateInput(today);
  const maxDay = localDateInput(new Date(today.getTime() + (L.dueMaxDays - 1) * 86_400_000));
  const lessonGroups = useMemo(() => groupLessons(catalog.catalog?.lessons ?? []), [catalog.catalog]);
  const exams = catalog.catalog?.exams ?? [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    const errors: typeof fieldError = {};
    let input: CreateAssignmentInput;
    const cleanedNote = note.replace(/\s+/g, ' ').trim();
    if (cleanedNote.length > L.note) errors.note = teacherErrorMessage({ message: 'note_too_long' });
    if (dueDay && !isDueDayAllowed(dueDay)) errors.due = teacherErrorMessage({ message: 'invalid_due' });
    const due_at = dueDay ? dueDayToIso(dueDay) : null;
    const common = { due_at, note: cleanedNote || null };
    if (kind === 'review') {
      const n = Number(target.trim());
      if (!Number.isInteger(n) || n < 1 || n > L.reviewTargetMax) errors.target = teacherErrorMessage({ message: 'invalid_target' });
      input = { kind, target_count: n, ...common };
    } else {
      if (!refId) errors.ref = kind === 'lesson' ? 'Hãy chọn một bài học.' : 'Hãy chọn một đề luyện thi.';
      input = { kind, ref_id: refId, ...common };
    }
    setFieldError(errors);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(input);
      onClose();
    } catch (e) {
      setError(teacherErrorMessage(e));
      setBusy(false);
    }
  }

  let picker = null;
  if (kind !== 'review') {
    if (catalog.status === 'loading' || catalog.status === 'idle') {
      picker = (
        <p role="status" className="flex items-center gap-2 px-1 text-[15px] text-muted">
          <Spinner />
          Đang tải danh sách nội dung…
        </p>
      );
    } else if (catalog.status === 'error') {
      picker = (
        <p role="alert" className="rounded-2xl border border-error/50 bg-error/10 px-4 py-3 text-[15px] text-error-text">
          {catalog.error}{' '}
          <button type="button" onClick={catalog.reload} className="min-h-11 font-semibold underline">
            Thử lại
          </button>
        </p>
      );
    } else if (kind === 'lesson') {
      picker =
        lessonGroups.length === 0 ? (
          <p className="px-1 text-[15px] text-muted">Chưa có bài học nào được xuất bản cho ngôn ngữ này.</p>
        ) : (
          <FormField label="Bài học" error={fieldError.ref}>
            {({ invalid, ...a11y }) => (
              <select
                {...a11y}
                aria-invalid={invalid || undefined}
                value={refId}
                onChange={(e) => setRefId(e.target.value)}
                className={cn(inputClasses(invalid), 'appearance-none truncate pr-8')}
              >
                <option value="">Chọn bài học…</option>
                {lessonGroups.map(([group, lessons]) => (
                  <optgroup key={group} label={group}>
                    {lessons.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </FormField>
        );
    } else {
      picker =
        exams.length === 0 ? (
          <p className="px-1 text-[15px] text-muted">Chưa có đề luyện thi nào cho ngôn ngữ này.</p>
        ) : (
          <FormField label="Đề luyện thi" error={fieldError.ref}>
            {({ invalid, ...a11y }) => (
              <select
                {...a11y}
                aria-invalid={invalid || undefined}
                value={refId}
                onChange={(e) => setRefId(e.target.value)}
                className={cn(inputClasses(invalid), 'appearance-none truncate pr-8')}
              >
                <option value="">Chọn đề…</option>
                {exams.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        );
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      {error && (
        <p role="alert" className="rounded-2xl border border-error/50 bg-error/10 px-4 py-3 text-[15px] text-error-text">
          {error}
        </p>
      )}
      <div role="radiogroup" aria-labelledby={kindLabelId} className="space-y-1.5">
        <p id={kindLabelId} className="px-1 text-sm font-medium">
          Loại bài
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ASSIGNMENT_KINDS.map((k) => {
            const selected = kind === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setKind(k);
                  setRefId('');
                  setFieldError({});
                }}
                className={cn(
                  'flex min-h-12 items-center justify-center rounded-2xl border px-1.5 py-2 text-center text-[15px] leading-tight',
                  selected ? 'border-primary bg-primary/10 font-semibold' : 'border-border bg-surface-solid',
                )}
              >
                {ASSIGNMENT_KIND_LABELS[k]}
              </button>
            );
          })}
        </div>
        <p className="px-1 text-sm text-muted">{KIND_HINTS[kind]}</p>
      </div>
      {picker}
      {kind === 'review' && (
        <FormField label="Số lượt ôn cần chấm" hint={`Từ 1 đến ${L.reviewTargetMax}.`} error={fieldError.target}>
          {(a11y) => <Input {...a11y} value={target} inputMode="numeric" autoComplete="off" onChange={(e) => setTarget(e.target.value)} />}
        </FormField>
      )}
      <FormField label="Hạn hoàn thành (tuỳ chọn)" hint="Tính đến 23:59 ngày đã chọn, theo giờ trên máy bạn." error={fieldError.due}>
        {(a11y) => <Input {...a11y} type="date" value={dueDay} min={minDay} max={maxDay} onChange={(e) => setDueDay(e.target.value)} />}
      </FormField>
      <FormField label="Lời nhắn cho học viên (tuỳ chọn)" hint={`Tối đa ${L.note} ký tự.`} error={fieldError.note}>
        {({ invalid, ...a11y }) => (
          <textarea
            {...a11y}
            aria-invalid={invalid || undefined}
            value={note}
            rows={3}
            maxLength={L.note * 2}
            onChange={(e) => setNote(e.target.value)}
            className={cn(inputClasses(invalid), 'min-h-24 resize-y rounded-3xl py-3')}
          />
        )}
      </FormField>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="ghost" size="lg" block onClick={onClose} disabled={busy}>
          Huỷ
        </Button>
        <Button type="submit" size="lg" block loading={busy}>
          Giao bài
        </Button>
      </div>
    </form>
  );
}
