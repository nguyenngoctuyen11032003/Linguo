import { useId, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { ListenPrompt } from '@linguo/shared';
import { cn } from '@/lib/cn';
import { ChoiceGroup } from './ChoiceGroup';
import { audioUrl, useOrderedOptions } from './exercise-utils';
import type { ChoiceExerciseProps } from './McqExercise';

export function ListenExercise({ prompt, seed, ...rest }: ChoiceExerciseProps & { prompt: ListenPrompt }) {
  const labelId = useId();
  const options = useOrderedOptions(prompt.options, prompt.shuffle, seed);
  const [failed, setFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasAudio = prompt.audio_asset_id !== null && !failed;

  const play = () => {
    if (!prompt.audio_asset_id) return;
    try {
      audioRef.current ??= new Audio(audioUrl(prompt.audio_asset_id));
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => setFailed(true));
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="min-w-0">
      <p id={labelId} className="mb-3 text-[18px] font-semibold leading-snug">
        Nghe và chọn nghĩa đúng
      </p>
      <button
        type="button"
        onClick={play}
        disabled={!hasAudio}
        className={cn(
          'mb-3 inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-[15px] font-semibold',
          hasAudio ? 'bg-primary text-on-primary hover:bg-primary-strong' : 'cursor-not-allowed border border-border text-muted',
        )}
      >
        {hasAudio ? <Volume2 aria-hidden className="size-5" /> : <VolumeX aria-hidden className="size-5" />}
        {hasAudio ? 'Nghe' : 'Chưa có audio'}
      </button>
      {!hasAudio && (
        <p className="mb-4 rounded-2xl border border-border bg-surface-solid px-4 py-3 text-[17px] break-words">
          <span className="block text-sm font-medium text-muted">Đọc thay vì nghe</span>
          <span>{prompt.fallback_text}</span>
        </p>
      )}
      <ChoiceGroup labelledBy={labelId} options={options} {...rest} />
    </div>
  );
}
