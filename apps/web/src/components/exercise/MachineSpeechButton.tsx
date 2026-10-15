import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw, Square, Volume2 } from 'lucide-react';
import { canSpeak, onVoicesChanged, speak, stopSpeaking, type TtsLanguage } from '@/features/exam/tts';
import { cn } from '@/lib/cn';

export const NORMAL_RATE = 0.9;
export const SLOW_RATE = 0.7;

/** Korean script means Korean; everything else the app teaches is English. */
export function detectScriptLang(text: string): TtsLanguage {
  return /[ᄀ-ᇿㄱ-ㆎ가-힣]/.test(text) ? 'ko' : 'en';
}

export type MachineSpeechState = 'idle' | 'speaking' | 'error';

export interface MachineSpeech {
  /** The browser has a speechSynthesis voice for the language (voices can load late). */
  available: boolean;
  state: MachineSpeechState;
  /** Speed of the utterance that is playing or failed last. */
  rate: number | null;
  play: (rate?: number) => void;
  stop: () => void;
}

/** Reads `text` aloud with speechSynthesis. Never autoplays; stops on unmount. Key the caller by text. */
export function useMachineSpeech(text: string, lang: TtsLanguage): MachineSpeech {
  const [available, setAvailable] = useState(() => canSpeak(lang));
  const [state, setState] = useState<MachineSpeechState>('idle');
  const [rate, setRate] = useState<number | null>(null);
  const token = useRef(0);

  useEffect(() => {
    const refresh = () => setAvailable(canSpeak(lang));
    refresh();
    const off = onVoicesChanged(refresh);
    return () => {
      off();
      token.current += 1;
      stopSpeaking();
    };
  }, [lang]);

  const stop = useCallback(() => {
    token.current += 1;
    stopSpeaking();
    setState('idle');
  }, []);

  const play = useCallback(
    (nextRate: number = NORMAL_RATE) => {
      const id = ++token.current;
      setState('speaking');
      setRate(nextRate);
      speak(text, lang, { rate: nextRate }).then(
        () => token.current === id && setState('idle'),
        () => token.current === id && setState('error'),
      );
    },
    [text, lang],
  );

  return { available, state, rate, play, stop };
}

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

const base = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold';

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
        onClick={active ? stop : () => play(r)}
        aria-label={active ? `Dừng đọc: ${text}` : failed ? `Không đọc được. Thử lại: ${text}` : `${name}: ${text}`}
        className={cn(
          base,
          active || failed ? 'border border-primary bg-surface-solid text-text' : 'border border-border bg-surface-solid text-text hover:bg-text/5',
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
