import { useMemo, useState, type FormEvent, type RefObject } from 'react';
import { TEACHER_LIMITS as L, type TeacherAssignment, type UpdateAssignmentInput } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input, inputClasses } from '@/components/ui/Input';
import { teacherErrorMessage } from '@/features/teacher/error-map';
import { assignmentTitle, dueDayToIso, isDueDayAllowed, localDateInput } from '@/features/teacher/format';
import { cn } from '@/lib/cn';
import { VocabDialog as Dialog } from '@/routes/app/vocab/VocabDialog';

export interface EditAssignmentDialogProps {
  /** The assignment being edited; null keeps the dialog closed. */
  assignment: TeacherAssignment | null;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSubmit: (assignment: TeacherAssignment, input: UpdateAssignmentInput) => Promise<void>;
}

/** Change the due date and the note of an assignment (the content and the exam mode stay as given). */
export function EditAssignmentDialog({ assignment, triggerRef, onClose, onSubmit }: EditAssignmentDialogProps) {
  return (
    <Dialog
      open={assignment !== null}
      onClose={onClose}
      triggerRef={triggerRef}
      title="Sửa bài giao"
      description={assignment ? assignmentTitle(assignment) : undefined}
    >
      {assignment && <EditForm key={assignment.id} assignment={assignment} onClose={onClose} onSubmit={onSubmit} />}
    </Dialog>
  );
}

function EditForm({ assignment, onClose, onSubmit }: { assignment: TeacherAssignment; onClose: () => void; onSubmit: EditAssignmentDialogProps['onSubmit'] }) {
  const initialDay = assignment.due_at ? localDateInput(new Date(assignment.due_at)) : '';
  const [dueDay, setDueDay] = useState(initialDay);
  const [note, setNote] = useState(assignment.note ?? '');
  const [fieldError, setFieldError] = useState<{ due?: string; note?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = useMemo(() => new Date(), []);
  const minDay = localDateInput(today);
  const maxDay = localDateInput(new Date(today.getTime() + (L.dueMaxDays - 1) * 86_400_000));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const errors: typeof fieldError = {};
    const cleanedNote = note.replace(/\s+/g, ' ').trim();
    if (cleanedNote.length > L.note) errors.note = teacherErrorMessage({ message: 'note_too_long' });
    // The due date is only sent when it changed: an overdue assignment keeps its date while its note is edited.
    const dueChanged = dueDay !== initialDay;
    if (dueChanged && dueDay && !isDueDayAllowed(dueDay)) errors.due = teacherErrorMessage({ message: 'invalid_due' });
    setFieldError(errors);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(assignment, {
        note: cleanedNote || null,
        closed: assignment.closed_at !== null,
        set_due: dueChanged,
        due_at: dueChanged && dueDay ? dueDayToIso(dueDay) : null,
      });
      onClose();
    } catch (e) {
      setError(teacherErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      {error && (
        <p role="alert" className="rounded-2xl border border-error/50 bg-error/10 px-4 py-3 text-[15px] text-error-text">
          {error}
        </p>
      )}
      <FormField
        label="Hạn hoàn thành"
        hint={assignment.due_at ? 'Xoá ngày để bỏ hạn. Hạn mới tính đến 23:59 ngày đã chọn, theo giờ trên máy bạn.' : 'Tuỳ chọn. Tính đến 23:59 ngày đã chọn, theo giờ trên máy bạn.'}
        error={fieldError.due}
      >
        {(a11y) => <Input {...a11y} type="date" value={dueDay} min={dueDay === initialDay ? undefined : minDay} max={maxDay} onChange={(e) => setDueDay(e.target.value)} />}
      </FormField>
      <FormField label="Lời nhắn cho học viên" hint={`Tối đa ${L.note} ký tự. Để trống để xoá lời nhắn.`} error={fieldError.note}>
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
          Lưu thay đổi
        </Button>
      </div>
    </form>
  );
}
