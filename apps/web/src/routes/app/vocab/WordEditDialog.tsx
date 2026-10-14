import { useState, type FormEvent, type RefObject } from 'react';
import { PERSONAL_VOCAB_LIMITS as L, cleanPersonalText, type PersonalLanguage, type PersonalWord } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { personalVocabErrorMessage } from '@/features/personal-vocab/error-map';
import type { PersonalWordFields } from '@/features/personal-vocab/service';
import { VocabDialog } from './VocabDialog';

export interface WordEditDialogProps {
  /** The word being edited; null keeps the dialog closed. */
  word: PersonalWord | null;
  language: PersonalLanguage;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSave: (wordId: string, fields: PersonalWordFields) => Promise<void>;
}

export function WordEditDialog({ word, language, triggerRef, onClose, onSave }: WordEditDialogProps) {
  return (
    <VocabDialog open={word !== null} onClose={onClose} triggerRef={triggerRef} title="Sửa từ">
      {word && <WordForm key={word.id} word={word} language={language} onClose={onClose} onSave={onSave} />}
    </VocabDialog>
  );
}

function WordForm({ word, language, onClose, onSave }: { word: PersonalWord; language: PersonalLanguage; onClose: () => void; onSave: WordEditDialogProps['onSave'] }) {
  const [term, setTerm] = useState(word.term);
  const [meaning, setMeaning] = useState(word.meaning);
  const [example, setExample] = useState(word.example ?? '');
  const [note, setNote] = useState(word.note ?? '');
  const [pronunciation, setPronunciation] = useState(word.pronunciation ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanedTerm = cleanPersonalText(term);
    const cleanedMeaning = cleanPersonalText(meaning);
    if (!cleanedTerm || !cleanedMeaning) {
      setError('Từ và nghĩa không được để trống nhé.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(word.id, {
        term: cleanedTerm,
        meaning: cleanedMeaning,
        example: cleanPersonalText(example),
        note: cleanPersonalText(note),
        pronunciation: cleanPersonalText(pronunciation),
      });
      onClose();
    } catch (e) {
      setError(personalVocabErrorMessage(e));
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
      <FormField label="Từ">
        {(a11y) => <Input {...a11y} lang={language} value={term} maxLength={L.term * 2} autoComplete="off" onChange={(e) => setTerm(e.target.value)} />}
      </FormField>
      <FormField label="Nghĩa">
        {(a11y) => <Input {...a11y} value={meaning} maxLength={L.meaning * 2} autoComplete="off" onChange={(e) => setMeaning(e.target.value)} />}
      </FormField>
      <FormField label="Ví dụ (không bắt buộc)">
        {(a11y) => <Input {...a11y} lang={language} value={example} maxLength={L.example * 2} autoComplete="off" onChange={(e) => setExample(e.target.value)} />}
      </FormField>
      <FormField label="Phát âm (không bắt buộc)">
        {(a11y) => <Input {...a11y} value={pronunciation} maxLength={L.pronunciation * 2} autoComplete="off" onChange={(e) => setPronunciation(e.target.value)} />}
      </FormField>
      <FormField label="Ghi chú (không bắt buộc)">
        {(a11y) => <Input {...a11y} value={note} maxLength={L.note * 2} autoComplete="off" onChange={(e) => setNote(e.target.value)} />}
      </FormField>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="ghost" size="lg" block onClick={onClose} disabled={busy}>
          Huỷ
        </Button>
        <Button type="submit" size="lg" block loading={busy}>
          Lưu
        </Button>
      </div>
    </form>
  );
}
