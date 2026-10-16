import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import type { SpeakingSentence } from '@/features/speaking/content';
import type { Ratings, SpeakingLanguage } from '@/features/speaking/ratings';
import type { TtsApi } from '@/features/speaking/useTts';
import { ListenButton } from './ListenButton';
import { PracticePanel } from './PracticePanel';

interface Props {
  lang: SpeakingLanguage;
  sentences: SpeakingSentence[];
  tts: TtsApi;
  transcribe: boolean;
  onSaveReflection: (ratings: Ratings) => void;
}

/** "Nhắc lại câu": see the sentence, hear it, say it, listen to yourself. */
export function RepeatMode({ lang, sentences, tts, transcribe, onSaveReflection }: Props) {
  const [index, setIndex] = useState(0);
  const at = Math.min(index, sentences.length - 1);
  const sentence = sentences[at];
  if (!sentence) return null;

  const go = (next: number) => {
    tts.stop();
    setIndex(next);
  };

  return (
    <SolidCard className="space-y-5 max-[379px]:p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-[-0.02em]">Nhắc lại câu</h2>
        <p className="rounded-full bg-text/5 px-3 py-1 text-[13px] font-bold tabular-nums" aria-live="polite">
          Câu {at + 1}/{sentences.length}
        </p>
      </div>
      <div className="relative isolate space-y-2 overflow-hidden rounded-[1.75rem] bg-[image:var(--hero-bg)] p-5 text-white ring-1 ring-white/10 ring-inset">
        <div aria-hidden="true" className="absolute -bottom-20 -right-12 -z-10 size-48 rounded-full bg-accent/25 blur-3xl" />
        <p lang={lang} className="text-[26px] font-bold leading-snug tracking-[-0.02em] [overflow-wrap:anywhere]">
          {sentence.text}
        </p>
        <p className="text-[15px] text-white/75">{sentence.translation}</p>
        {sentences.length > 1 && (
          <div aria-hidden="true" className="flex gap-1 pt-2">
            {sentences.map((s, i) => (
              <span key={s.id} className={i <= at ? 'h-1 flex-1 rounded-full bg-white' : 'h-1 flex-1 rounded-full bg-white/20'} />
            ))}
          </div>
        )}
      </div>
      <ListenButton text={sentence.text} lang={lang} tts={tts} />
      <PracticePanel
        key={sentence.id}
        lang={lang}
        target={sentence.text}
        transcribe={transcribe}
        tts={tts}
        onSaveReflection={onSaveReflection}
      />
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="ghost" className="whitespace-nowrap" aria-label="Câu trước" disabled={at === 0} onClick={() => go(at - 1)}>
          <ChevronLeft aria-hidden className="size-4" />
          <span className="max-[379px]:hidden">Câu trước</span>
          <span className="min-[380px]:hidden">Trước</span>
        </Button>
        <Button variant="ghost" className="whitespace-nowrap" aria-label="Câu tiếp" disabled={at >= sentences.length - 1} onClick={() => go(at + 1)}>
          <span className="max-[379px]:hidden">Câu tiếp</span>
          <span className="min-[380px]:hidden">Tiếp</span>
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </SolidCard>
  );
}
