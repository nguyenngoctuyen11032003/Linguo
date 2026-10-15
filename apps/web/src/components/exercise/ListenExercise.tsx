import { useId, useState } from 'react';
import type { ListenPrompt } from '@linguo/shared';
import { AudioPlayButton } from './AudioPlayButton';
import { ChoiceGroup } from './ChoiceGroup';
import { detectScriptLang, MachineSpeechButton } from './MachineSpeechButton';
import { useOrderedOptions } from './exercise-utils';
import type { ChoiceExerciseProps } from './McqExercise';

export function ListenExercise({ prompt, seed, ...rest }: ChoiceExerciseProps & { prompt: ListenPrompt }) {
  const labelId = useId();
  const options = useOrderedOptions(prompt.options, prompt.shuffle, seed);
  const [failed, setFailed] = useState(false);
  const noAudio = prompt.audio_asset_id === null;

  return (
    <div className="min-w-0">
      <p id={labelId} className="mb-3 text-[18px] font-semibold leading-snug">
        Nghe và chọn nghĩa đúng
      </p>
      <AudioPlayButton path={prompt.audio_asset_id} onFailedChange={setFailed} className="mb-3" />
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
        <p className="mb-4 rounded-2xl border border-border bg-surface-solid px-4 py-3 text-[17px] break-words">
          <span className="block text-sm font-medium text-muted">Đọc thay vì nghe</span>
          <span>{prompt.fallback_text}</span>
        </p>
      )}
      <ChoiceGroup labelledBy={labelId} options={options} {...rest} />
    </div>
  );
}
