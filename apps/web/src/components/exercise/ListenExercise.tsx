import { useId, useState } from 'react';
import type { ListenPrompt } from '@linguo/shared';
import { ContentAudio } from '@/features/audio/ContentAudio';
import { ChoiceGroup } from './ChoiceGroup';
import { detectScriptLang } from './machine-speech';
import { MachineSpeechButton } from './MachineSpeechButton';
import { useOrderedOptions } from './exercise-utils';
import type { ChoiceExerciseProps } from './McqExercise';

export function ListenExercise({ prompt, seed, ...rest }: ChoiceExerciseProps & { prompt: ListenPrompt }) {
  const labelId = useId();
  const options = useOrderedOptions(prompt.options, prompt.shuffle, seed);
  const [failed, setFailed] = useState(false);
  const noAudio = prompt.audio_asset_id === null;

  return (
    <div className="min-w-0">
      <p id={labelId} className="mb-4 text-[19px] font-bold leading-snug">
        Nghe và chọn nghĩa đúng
      </p>
      {prompt.audio_asset_id !== null && <ContentAudio key={prompt.audio_asset_id} assetId={prompt.audio_asset_id} fallbackText={prompt.fallback_text} onFailedChange={setFailed} className="mb-3" />}
      {noAudio && (
        <MachineSpeechButton
          key={prompt.fallback_text}
          text={prompt.fallback_text}
          lang={detectScriptLang(prompt.fallback_text)}
          label="Nghe bằng giọng đọc của máy"
          slow
          className="mb-3"
        />
      )}
      {(noAudio || failed) && (
        <p className="card mb-5 rounded-[1.25rem] px-4 py-3 text-[17px] font-medium break-words">
          <span className="eyebrow block">Đọc thay vì nghe</span>
          <span>{prompt.fallback_text}</span>
        </p>
      )}
      <ChoiceGroup labelledBy={labelId} options={options} {...rest} />
    </div>
  );
}
