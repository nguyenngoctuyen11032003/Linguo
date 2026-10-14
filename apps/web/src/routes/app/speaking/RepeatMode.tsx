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
    <SolidCard className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-[-0.02em]">Nhắc lại câu</h2>
        <p className="text-sm text-muted" aria-live="polite">
          Câu {at + 1}/{sentences.length}
        </p>
      </div>
      <div className="space-y-2 rounded-2xl bg-primary/8 p-4">
        <p lang={lang} className="text-2xl font-bold leading-snug tracking-[-0.02em] [overflow-wrap:anywhere]">
          {sentence.text}
        </p>
        <p className="text-[15px] text-muted">{sentence.translation}</p>
      </div>
      <ListenButton text={sentence.text} lang={lang} tts={tts} />
      <PracticePanel
        key={sentence.id}
        lang={lang}
        target={sentence.text}
        transcribe={transcribe}
        onSaveReflection={onSaveReflection}
      />
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="ghost" disabled={at === 0} onClick={() => go(at - 1)}>
          <ChevronLeft aria-hidden className="size-4" />
          Câu trước
        </Button>
        <Button variant="ghost" disabled={at >= sentences.length - 1} onClick={() => go(at + 1)}>
          Câu tiếp
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </SolidCard>
  );
}
