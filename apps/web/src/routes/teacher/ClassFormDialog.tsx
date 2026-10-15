import { useId, useState, type FormEvent, type RefObject } from 'react';
import { TEACHER_LIMITS as L, type ClassLanguage } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { teacherErrorMessage } from '@/features/teacher/error-map';
import { CLASS_LANGUAGE_CHOICES, CLASS_LANGUAGE_LABELS, cleanClassName } from '@/features/teacher/format';
import { cn } from '@/lib/cn';
import { VocabDialog as Dialog } from '@/routes/app/vocab/VocabDialog';

export interface ClassFormDialogProps {
  open: boolean;
  /** 'create' also asks for the language; 'rename' keeps it (assignments depend on it). */
  mode: 'create' | 'rename';
  initialName?: string;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSubmit: (name: string, language: ClassLanguage) => Promise<void>;
}

/** Create or rename a class. Server errors stay in the dialog so the teacher can fix and resend. */
export function ClassFormDialog({ open, mode, initialName = '', triggerRef, onClose, onSubmit }: ClassFormDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      title={mode === 'create' ? 'Tạo lớp mới' : 'Đổi tên lớp'}
      description={mode === 'create' ? 'Đặt tên lớp và chọn ngôn ngữ học viên sẽ học.' : undefined}
    >
      <ClassForm mode={mode} initialName={initialName} onClose={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

function ClassForm({ mode, initialName, onClose, onSubmit }: Pick<ClassFormDialogProps, 'mode' | 'onClose' | 'onSubmit'> & { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [language, setLanguage] = useState<ClassLanguage>('en');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const languageLabelId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleaned = cleanClassName(name);
    if (!cleaned) {
      setError('Hãy đặt tên cho lớp nhé.');
      return;
    }
    if (cleaned.length > L.className) {
      setError(teacherErrorMessage({ message: 'invalid_name' }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(cleaned, language);
      onClose();
    } catch (e) {
      setError(teacherErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      <FormField label="Tên lớp" error={error ?? undefined} hint={`Tối đa ${L.className} ký tự.`}>
        {(a11y) => (
          <Input
            {...a11y}
            value={name}
            maxLength={L.className * 2}
            autoComplete="off"
            placeholder="Ví dụ: Lớp giao tiếp tối thứ Ba"
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </FormField>
      {mode === 'create' && (
        <div role="radiogroup" aria-labelledby={languageLabelId} className="space-y-1.5">
          <p id={languageLabelId} className="px-1 text-sm font-medium">
            Ngôn ngữ của lớp
          </p>
          <div className="grid grid-cols-2 gap-2">
            {CLASS_LANGUAGE_CHOICES.map((code) => {
              const selected = language === code;
              return (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setLanguage(code)}
                  className={cn(
                    'flex min-h-12 items-center justify-center rounded-2xl border px-2 py-2 text-center',
                    selected ? 'border-primary bg-primary/10 font-semibold' : 'border-border bg-surface-solid',
                  )}
                >
                  {CLASS_LANGUAGE_LABELS[code]}
                </button>
              );
            })}
          </div>
          <p className="px-1 text-sm text-muted">Không đổi được sau khi tạo, vì bài giao và tiến độ đều theo ngôn ngữ này.</p>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="ghost" size="lg" block onClick={onClose} disabled={busy}>
          Huỷ
        </Button>
        <Button type="submit" size="lg" block loading={busy}>
          {mode === 'create' ? 'Tạo lớp' : 'Lưu tên'}
        </Button>
      </div>
    </form>
  );
}
