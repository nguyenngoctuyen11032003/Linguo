import { useId, useState, type FormEvent, type RefObject } from 'react';
import { LANGUAGES, PERSONAL_LANGUAGES, PERSONAL_VOCAB_LIMITS as L, cleanPersonalText, type PersonalLanguage } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { personalVocabErrorMessage } from '@/features/personal-vocab/error-map';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { cn } from '@/lib/cn';
import { VocabDialog } from './VocabDialog';

function isPersonalLanguage(code: string | undefined): code is PersonalLanguage {
  return (PERSONAL_LANGUAGES as readonly string[]).includes(code ?? '');
}

export interface ListFormDialogProps {
  open: boolean;
  /** 'create' also asks for the language; 'rename' keeps it (it cannot change once words exist). */
  mode: 'create' | 'rename';
  initialName?: string;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSubmit: (name: string, language: PersonalLanguage) => Promise<void>;
}

/** Create or rename a personal list. Errors from the server stay in the dialog so the learner can fix and resend. */
export function ListFormDialog({ open, mode, initialName = '', triggerRef, onClose, onSubmit }: ListFormDialogProps) {
  return (
    <VocabDialog
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      title={mode === 'create' ? 'Tạo danh sách mới' : 'Đổi tên danh sách'}
      description={mode === 'create' ? 'Đặt tên và chọn ngôn ngữ của các từ bạn sắp thêm vào.' : undefined}
    >
      {/* Mounted only while open, so every opening starts from a fresh form. */}
      <ListForm mode={mode} initialName={initialName} onClose={onClose} onSubmit={onSubmit} />
    </VocabDialog>
  );
}

function ListForm({ mode, initialName, onClose, onSubmit }: Pick<ListFormDialogProps, 'mode' | 'onClose' | 'onSubmit'> & { initialName: string }) {
  const [name, setName] = useState(initialName);
  const pathLanguage = useLearningPaths().current?.language;
  // Start from the language the learner is studying now.
  const [language, setLanguage] = useState<PersonalLanguage>(() => (isPersonalLanguage(pathLanguage) ? pathLanguage : 'ko'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const languageName = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleaned = cleanPersonalText(name);
    if (!cleaned) {
      setError('Hãy đặt tên cho danh sách nhé.');
      return;
    }
    if (cleaned.length > L.listName) {
      setError(personalVocabErrorMessage({ message: 'invalid_name' }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(cleaned, language);
      onClose();
    } catch (e) {
      setError(personalVocabErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      <FormField label="Tên danh sách" error={error ?? undefined} hint={`Tối đa ${L.listName} ký tự.`}>
        {(a11y) => (
          <Input
            {...a11y}
            value={name}
            maxLength={L.listName * 2}
            autoComplete="off"
            placeholder="Ví dụ: Từ vựng bài đọc tuần này"
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </FormField>
      {mode === 'create' && (
        // Native radios: one Tab stop, arrow keys move the choice.
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 px-1 text-sm font-medium">Ngôn ngữ của các từ</legend>
          <div className="grid grid-cols-2 gap-2">
            {PERSONAL_LANGUAGES.map((code) => {
              const selected = language === code;
              return (
                <label
                  key={code}
                  className={cn(
                    'flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-2xl border px-2 py-2 text-center has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/45',
                    selected ? 'border-primary bg-primary/10 font-semibold' : 'border-border bg-surface-solid',
                  )}
                >
                  <input type="radio" name={languageName} value={code} checked={selected} onChange={() => setLanguage(code)} className="sr-only" />
                  <span>{LANGUAGES[code].nameVi}</span>
                  <span lang={code} className="text-sm text-muted">
                    {LANGUAGES[code].nativeName}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="ghost" size="lg" block onClick={onClose} disabled={busy}>
          Huỷ
        </Button>
        <Button type="submit" size="lg" block loading={busy}>
          {mode === 'create' ? 'Tạo danh sách' : 'Lưu tên'}
        </Button>
      </div>
    </form>
  );
}
