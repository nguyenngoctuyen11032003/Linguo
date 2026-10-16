import { Square, Volume2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TtsLanguage } from '@/features/exam/tts';
import { cn } from '@/lib/cn';
import { playSound } from '@/lib/sound';
import { detectScriptLang, speechText, toTtsLanguage, useMachineSpeech } from './machine-speech';

export interface SpeakButtonProps {
  /** The English / Korean / Japanese text to read aloud. */
  text: string;
  /** Language of `text`; Vietnamese (or unknown) renders nothing. Omit to guess it from the script. */
  lang?: string | null;
  /** Accessible verb phrase; the text itself is appended. */
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE = { sm: 'size-9', md: 'size-11' } as const;

function resolveLang(text: string, lang: string | null | undefined): TtsLanguage | null {
  if (lang === undefined) return detectScriptLang(text);
  return toTtsLanguage(lang);
}

/**
 * Round speaker button: tap to hear `text` pronounced with the browser's voice for its language, tap again to stop.
 * Renders nothing when the language has no voice installed, so it never leaves a dead control behind.
 */
export function SpeakButton({ text, lang, label = 'Nghe phát âm', size = 'md', className }: SpeakButtonProps) {
  const spoken = speechText(text);
  const language = resolveLang(spoken, lang) ?? 'en';
  const { available, state, play, stop } = useMachineSpeech(spoken, language);
  if (resolveLang(spoken, lang) === null || !available || spoken === '') return null;

  const active = state === 'speaking';
  return (
    <button
      type="button"
      onClick={
        active
          ? stop
          : () => {
              playSound('play');
              play();
            }
      }
      aria-label={active ? `Dừng đọc: ${spoken}` : `${label}: ${spoken}`}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border-2 transition-[translate,box-shadow,background-color] duration-150 active:translate-y-[2px]',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
        active
          ? 'border-primary bg-primary/15 text-primary shadow-[0_2px_0_var(--primary)]'
          : state === 'error'
            ? 'border-warn/60 bg-warn/10 text-text shadow-[0_2px_0_var(--border)]'
            : 'border-border bg-surface-solid text-primary shadow-[0_2px_0_var(--border)] hover:bg-primary/10',
        SIZE[size],
        className,
      )}
    >
      {active ? <Square aria-hidden className="size-3.5 fill-current" /> : <Volume2 aria-hidden className={size === 'sm' ? 'size-4' : 'size-5'} />}
    </button>
  );
}

/**
 * A foreign word or phrase inside Vietnamese prose: reads as normal text with a dotted underline and a tiny speaker,
 * and is itself the button. Falls back to a plain `lang`-tagged span when no voice is available.
 */
export function SpeakInline({ text, lang, children }: { text: string; lang: string; children?: ReactNode }) {
  const spoken = speechText(text);
  const language = toTtsLanguage(lang);
  const { available, state, play, stop } = useMachineSpeech(spoken, language ?? 'en');
  if (!language || !available || spoken === '') return <span lang={lang}>{children ?? text}</span>;

  const active = state === 'speaking';
  return (
    <button
      type="button"
      lang={lang}
      onClick={
        active
          ? stop
          : () => {
              playSound('play');
              play();
            }
      }
      aria-label={active ? `Dừng đọc: ${spoken}` : `Nghe phát âm: ${spoken}`}
      className={cn(
        'inline cursor-pointer rounded-sm border-0 bg-transparent p-0 align-baseline font-[inherit] text-[inherit] underline decoration-primary/60 decoration-dotted decoration-2 underline-offset-4',
        'hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        active && 'bg-primary/15',
      )}
    >
      {children ?? text}
      <Volume2 aria-hidden className="ml-0.5 inline size-[0.8em] align-[-0.05em] text-primary" />
    </button>
  );
}
