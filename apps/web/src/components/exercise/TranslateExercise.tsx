import { useId } from 'react';
import type { AnswerLang, TranslatePrompt } from '@linguo/shared';
import { AnswerInput } from './AnswerInput';
import { SpeakButton } from './SpeakButton';

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
      <div className="card mb-5 flex items-center justify-between gap-3 rounded-[1.5rem] px-5 py-4">
        <p id={sourceId} lang={prompt.source_lang} className="min-w-0 text-[20px] font-semibold leading-snug break-words">
          {prompt.source_text}
        </p>
        <SpeakButton text={prompt.source_text} lang={prompt.source_lang} label="Nghe câu cần dịch" />
      </div>
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
