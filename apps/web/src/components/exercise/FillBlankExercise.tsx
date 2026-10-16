import { Fragment, useId, useMemo, useRef } from 'react';
import type { AnswerLang, FillBlankPrompt } from '@linguo/shared';
import { AnswerInput } from './AnswerInput';
import { parseTemplate } from './exercise-utils';

export interface FillBlankExerciseProps {
  prompt: FillBlankPrompt;
  lang: AnswerLang;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onSubmitRequest: () => void;
  disabled?: boolean;
}

/** Template text with inline inputs; Enter moves to the next blank, and submits from the last one. */
export function FillBlankExercise({ prompt, lang, values, onChange, onSubmitRequest, disabled = false }: FillBlankExerciseProps) {
  const parts = useMemo(() => parseTemplate(prompt.template), [prompt.template]);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const blankIds = prompt.blanks.map((b) => b.id);
  const sentenceId = useId();
  /** The whole sentence with every blank as an ellipsis: each input's description, since its label is only its number. */
  const sentence = parts
    .map((part) => (part.kind === 'text' ? part.text : '…'))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <p lang={lang} className="min-w-0 text-[18px] leading-[3.25rem] break-words">
      {parts.map((part, i) => {
        if (part.kind === 'text') return <Fragment key={i}>{part.text}</Fragment>;
        const index = blankIds.indexOf(part.id);
        const blank = prompt.blanks[index];
        const width = Math.min(Math.max(blank?.width_hint ?? 6, 3), 20) + 3;
        return (
          <AnswerInput
            key={i}
            ref={(el) => {
              inputs.current[part.id] = el;
            }}
            aria-label={`Chỗ trống ${index + 1}`}
            aria-describedby={sentenceId}
            lang={lang}
            value={values[part.id] ?? ''}
            onValueChange={(v) => onChange({ ...values, [part.id]: v })}
            onSubmitRequest={() => {
              const nextId = blankIds[index + 1];
              if (nextId) inputs.current[nextId]?.focus();
              else onSubmitRequest();
            }}
            disabled={disabled}
            style={{ width: `${width}ch` }}
            className="mx-1 inline-block max-w-full min-h-11 align-middle px-3 leading-normal"
          />
        );
      })}
      <span id={sentenceId} hidden>
        {sentence}
      </span>
    </p>
  );
}
