import { useEffect, useRef } from 'react';
import { Loader2, Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { isAudioAssetId } from '@linguo/shared';
import { AudioPlayButton } from '@/components/exercise/AudioPlayButton';
import { MachineSpeechButton } from '@/components/exercise/MachineSpeechButton';
import type { TtsLanguage } from '@/features/exam/tts';
import { cn } from '@/lib/cn';
import { fallbackSpeechLang, NORMAL_AUDIO_RATE, SLOW_AUDIO_RATE } from './content-audio';
import { useContentAudio, type ContentAudioState } from './useContentAudio';

export interface ContentAudioProps {
  /** `audio_asset_id` (or a legacy audio path). */
  assetId: string;
  /** Text read by the machine voice when the recording cannot play; also its accessible description. */
  fallbackText?: string;
  /** Language of `fallbackText`; defaults to the id's language, else the script of the text. */
  fallbackLang?: TtsLanguage;
  /** Small layout (flashcards): icon-only secondary buttons. */
  compact?: boolean;
  className?: string;
  /** Tells the parent when the recording failed (it may show the text instead), and when a retry clears it. */
  onFailedChange?: (failed: boolean) => void;
}

const PRIMARY_LABEL: Record<ContentAudioState, string> = {
  idle: 'Nghe',
  loading: 'Đang tải…',
  playing: 'Tạm dừng',
  paused: 'Nghe tiếp',
  ended: 'Nghe',
  error: 'Thử lại',
};

const PRIMARY_NAME: Record<ContentAudioState, string> = {
  idle: 'Nghe bản ghi âm',
  loading: 'Đang tải bản ghi âm',
  playing: 'Tạm dừng bản ghi âm',
  paused: 'Nghe tiếp bản ghi âm',
  ended: 'Nghe bản ghi âm',
  error: 'Không phát được bản ghi âm. Thử lại',
};

const pill = 'inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full text-[15px] font-semibold';
const focus = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40';
const secondary = 'border border-border bg-surface-solid text-text hover:bg-text/5';

/**
 * Player for a recorded listening clip: play/pause, replay from the start and slow speed (0.75×). Nothing downloads
 * before the first press. When the clip cannot play (offline and not cached, missing file, blocked) it offers a
 * retry and the browser's machine voice reading `fallbackText`.
 */
export function ContentAudio(props: ContentAudioProps) {
  // Legacy audio paths (hand-placed files, not `<lang>-<hash>` ids) keep their original single "Nghe" button.
  if (!isAudioAssetId(props.assetId)) {
    return <AudioPlayButton path={props.assetId} onFailedChange={props.onFailedChange} className={props.className} />;
  }
  return <RecordedAudio {...props} />;
}

function RecordedAudio({ assetId, fallbackText, fallbackLang, compact = false, className, onFailedChange }: ContentAudioProps) {
  const { playable, state, rate, started, toggle, replay, setRate } = useContentAudio(assetId);
  const failed = state === 'error' || !playable;
  const changeRef = useRef(onFailedChange);
  useEffect(() => {
    changeRef.current = onFailedChange;
  }, [onFailedChange]);
  useEffect(() => {
    changeRef.current?.(failed);
  }, [failed]);

  const slow = rate === SLOW_AUDIO_RATE;
  const busy = state === 'loading';
  const text = fallbackText?.trim() ?? '';
  const speech = text ? (
    <MachineSpeechButton key={text} text={text} lang={fallbackLang ?? fallbackSpeechLang(assetId, text)} label="Nghe bằng giọng đọc của máy" compact={compact} />
  ) : null;

  if (!playable) return speech ? <div className={cn('min-w-0', className)}>{speech}</div> : null;

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', compact && 'items-center', className)} data-testid="content-audio">
      <div role="group" aria-label="Trình phát bản ghi âm" className={cn('flex flex-wrap items-center gap-2', compact && 'justify-center')}>
        <button
          type="button"
          onClick={toggle}
          aria-label={PRIMARY_NAME[state]}
          aria-busy={busy || undefined}
          className={cn(
            pill,
            focus,
            'px-5',
            state === 'error' ? secondary : 'bg-primary text-on-primary hover:bg-primary-strong',
            busy && 'cursor-progress',
          )}
        >
          {busy ? (
            <Loader2 aria-hidden className="size-5 shrink-0 motion-safe:animate-spin" />
          ) : state === 'playing' ? (
            <Pause aria-hidden className="size-5 shrink-0" />
          ) : state === 'error' ? (
            <RotateCw aria-hidden className="size-5 shrink-0" />
          ) : (
            <Play aria-hidden className="size-5 shrink-0" />
          )}
          {PRIMARY_LABEL[state]}
        </button>
        {started && state !== 'error' && (
          <button
            type="button"
            onClick={replay}
            disabled={busy}
            aria-label="Nghe lại từ đầu"
            className={cn(pill, focus, secondary, compact ? 'px-3' : 'px-4', 'disabled:cursor-not-allowed disabled:opacity-60')}
          >
            <RotateCcw aria-hidden className="size-5 shrink-0" />
            {!compact && 'Nghe lại'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setRate(slow ? NORMAL_AUDIO_RATE : SLOW_AUDIO_RATE)}
          aria-pressed={slow}
          aria-label="Nghe chậm (0,75×)"
          className={cn(pill, focus, 'px-4', slow ? 'border border-primary bg-primary/10 text-text' : secondary)}
        >
          0,75×
        </button>
      </div>
      <p role="status" aria-live="polite" className={state === 'error' ? 'text-sm font-medium text-error-text' : 'sr-only'}>
        {state === 'error' ? (speech ? 'Không phát được bản ghi âm. Bạn có thể nghe giọng đọc của máy.' : 'Không phát được bản ghi âm.') : ''}
      </p>
      {state === 'error' && speech}
    </div>
  );
}
