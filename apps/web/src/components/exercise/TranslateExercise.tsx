import { useId } from 'react';
import type { AnswerLang, TranslatePrompt } from '@linguo/shared';
import { AnswerInput } from './AnswerInput';

export interface TranslateExerciseProps {
  prompt: TranslatePrompt;
  lang: AnswerLang;
  text: string;
  onChange: (text: string) => void;
  onSubmitRequest: () => void;
  disabled?: boolean;
}

export function TranslateExercise({ prompt, lang, text, onChange, onSubmitRequest, disabled = false }: TranslateExerciseProps) {
  const sourceId = useId();
  return (
    <div className="min-w-0">
      <p
        id={sourceId}
        lang={prompt.source_lang}
        className="mb-4 rounded-2xl border border-border bg-surface-solid px-4 py-3 text-[18px] font-medium leading-snug break-words"
      >
        {prompt.source_text}
      </p>
      <AnswerInput
        aria-label="Bản dịch của bạn"
        aria-describedby={sourceId}
        lang={lang}
        value={text}
        onValueChange={onChange}
        onSubmitRequest={onSubmitRequest}
        disabled={disabled}
        placeholder="Nhập bản dịch"
      />
    </div>
  );
}
