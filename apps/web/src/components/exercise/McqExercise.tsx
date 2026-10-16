import { useId } from 'react';
import type { McqPrompt } from '@linguo/shared';
import { ChoiceGroup, type ChoiceMarks } from './ChoiceGroup';
import { useOrderedOptions } from './exercise-utils';
import { SpeakButton } from './SpeakButton';

export interface ChoiceExerciseProps {
  /** Shuffle seed: the exercise id, so the order is stable across renders and reloads. */
  seed: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
  marks?: ChoiceMarks | null;
}

export function McqExercise({ prompt, seed, ...rest }: ChoiceExerciseProps & { prompt: McqPrompt }) {
  const stemId = useId();
  const options = useOrderedOptions(prompt.options, prompt.shuffle, seed);
  return (
    <div className="min-w-0">
      <div className="mb-5 flex items-start justify-between gap-3">
        <p id={stemId} lang={prompt.stem_lang} className="min-w-0 text-[22px] font-extrabold leading-[1.3] tracking-[-0.015em] break-words">
          {prompt.stem}
        </p>
        <SpeakButton text={prompt.stem} lang={prompt.stem_lang} label="Nghe câu hỏi" />
      </div>
      <ChoiceGroup labelledBy={stemId} options={options} {...rest} />
    </div>
  );
}
