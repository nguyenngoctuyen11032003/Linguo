import { Square, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { SpeakingLanguage } from '@/features/speaking/ratings';
import type { TtsApi } from '@/features/speaking/useTts';

const LANGUAGE_NAME: Record<SpeakingLanguage, string> = { en: 'tiếng Anh', ko: 'tiếng Hàn' };

/** Reads `text` aloud with the browser voice; without a voice it says so and the script stays the way to practise. */
export function ListenButton({ text, lang, tts, label = 'Nghe mẫu' }: { text: string; lang: SpeakingLanguage; tts: TtsApi; label?: string }) {
  if (!tts.available) {
    return (
      <p className="text-sm text-muted">
        Trình duyệt chưa có giọng đọc {LANGUAGE_NAME[lang]}, nên bạn hãy đọc to theo script nhé.
      </p>
    );
  }
  const playing = tts.speakingText === text;
  return playing ? (
    <Button variant="ghost" onClick={tts.stop}>
      <Square aria-hidden className="size-4" />
      Dừng nghe
    </Button>
  ) : (
    <Button variant="ghost" onClick={() => tts.play(text)}>
      <Volume2 aria-hidden className="size-4" />
      {label}
    </Button>
  );
}
