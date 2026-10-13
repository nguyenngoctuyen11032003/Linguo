import { useId } from 'react';
import type { McqPrompt } from '@linguo/shared';
import { ChoiceGroup, type ChoiceMarks } from './ChoiceGroup';
import { useOrderedOptions } from './exercise-utils';

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
      <p id={stemId} lang={prompt.stem_lang} className="mb-4 text-[18px] font-semibold leading-snug break-words">
        {prompt.stem}
      </p>
      <ChoiceGroup labelledBy={stemId} options={options} {...rest} />
    </div>
  );
}
