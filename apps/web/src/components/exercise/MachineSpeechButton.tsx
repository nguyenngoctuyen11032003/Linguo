import { RotateCw, Square, Volume2 } from 'lucide-react';
import type { TtsLanguage } from '@/features/exam/tts';
import { NORMAL_RATE, SLOW_RATE, useMachineSpeech } from './machine-speech';
import { cn } from '@/lib/cn';
import { playSound } from '@/lib/sound';

export interface MachineSpeechButtonProps {
  text: string;
  lang: TtsLanguage;
  /** Idle label, e.g. "Nghe bằng giọng đọc của máy". */
  label: string;
  /** Also offer a "Nghe chậm" button. */
  slow?: boolean;
  /** Show "Nghe" as the visible label (the full label stays in the accessible name). */
  compact?: boolean;
  /** Show the "machine speech" note under the button. */
  note?: boolean;
  className?: string;
}

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 px-5 text-[15px] font-bold transition-[translate,box-shadow] duration-150 active:translate-y-[3px]';

/** Machine-voice button(s). Renders nothing when the browser has no voice for the language. */
export function MachineSpeechButton({ text, lang, label, slow = false, compact = false, note = true, className }: MachineSpeechButtonProps) {
  const { available, state, rate, play, stop } = useMachineSpeech(text, lang);
  if (!available || text.trim() === '') return null;

  const button = (r: number, name: string, shortName: string) => {
    const active = state === 'speaking' && rate === r;
    const failed = state === 'error' && rate === r;
    return (
      <button
        type="button"
        onClick={
          active
            ? stop
            : () => {
                playSound('play');
                play(r);
              }
        }
        aria-label={active ? `Dừng đọc: ${text}` : failed ? `Không đọc được. Thử lại: ${text}` : `${name}: ${text}`}
        className={cn(
          base,
          active || failed
            ? 'border-primary bg-primary/10 text-text shadow-[0_4px_0_var(--primary)] active:shadow-[0_1px_0_var(--primary)]'
            : 'border-border bg-surface-solid text-text shadow-[0_4px_0_var(--border)] hover:bg-text/5 active:shadow-[0_1px_0_var(--border)]',
        )}
      >
        {active ? (
          <Square aria-hidden className="size-4 shrink-0" />
        ) : failed ? (
          <RotateCw aria-hidden className="size-5 shrink-0" />
        ) : (
          <Volume2 aria-hidden className="size-5 shrink-0" />
        )}
        {active ? 'Dừng' : failed ? 'Thử lại' : compact ? shortName : name}
      </button>
    );
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <div className="flex flex-wrap gap-2">
        {button(NORMAL_RATE, label, 'Nghe')}
        {slow && button(SLOW_RATE, 'Nghe chậm', 'Nghe chậm')}
      </div>
      {note && <p className="text-sm text-muted">Giọng đọc tự động — chỉ để luyện nghe</p>}
    </div>
  );
}
