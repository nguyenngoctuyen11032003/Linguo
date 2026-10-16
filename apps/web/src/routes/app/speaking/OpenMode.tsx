import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { openPromptsFor, type SpeakingSentence } from '@/features/speaking/content';
import type { Ratings, SpeakingLanguage } from '@/features/speaking/ratings';
import { PracticePanel } from './PracticePanel';

interface Props {
  lang: SpeakingLanguage;
  lessonTitle: string | null;
  /** Lesson sentences offered as help; open answers are never compared with them. */
  helpSentences: SpeakingSentence[];
  transcribe: boolean;
  onSaveReflection: (ratings: Ratings) => void;
}

const HELP_SHOWN = 3;
const LANGUAGE_NAME: Record<SpeakingLanguage, string> = { en: 'tiếng Anh', ko: 'tiếng Hàn', ja: 'tiếng Nhật' };

/** "Trả lời mở": a question in Vietnamese, the learner answers freely in the target language. */
export function OpenMode({ lang, lessonTitle, helpSentences, transcribe, onSaveReflection }: Props) {
  const prompts = useMemo(() => openPromptsFor(lang, lessonTitle), [lang, lessonTitle]);
  const [index, setIndex] = useState(0);
  const prompt = prompts[index % prompts.length];
  if (!prompt) return null;
  const help = helpSentences.slice(0, HELP_SHOWN);

  return (
    <SolidCard className="space-y-5">
      <h2 className="text-xl font-extrabold tracking-[-0.02em]">Trả lời mở</h2>
      <div className="relative isolate space-y-2 overflow-hidden rounded-[1.75rem] bg-[image:var(--hero-bg)] p-5 text-white ring-1 ring-white/10 ring-inset">
        <div aria-hidden="true" className="absolute -bottom-20 -right-12 -z-10 size-48 rounded-full bg-accent/25 blur-3xl" />
        <p className="text-[22px] font-bold leading-snug tracking-[-0.02em]">{prompt.question}</p>
        {prompt.starter && (
          <p className="text-[15px] text-white/75">
            Gợi ý mở đầu: <span lang={lang}>{prompt.starter}</span>
          </p>
        )}
        <p className="text-sm text-white/75">Hãy nói khoảng 20–40 giây bằng {LANGUAGE_NAME[lang]}. Câu đơn giản cũng rất tốt.</p>
      </div>
      {help.length > 0 && (
        <details className="rounded-2xl bg-text/[0.03] px-4 py-2 ring-1 ring-border ring-inset">
          <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-semibold">Câu mẫu từ bài học để tham khảo</summary>
          <ul className="space-y-2 pb-2">
            {help.map((s) => (
              <li key={s.id}>
                <span lang={lang} className="font-medium [overflow-wrap:anywhere]">
                  {s.text}
                </span>
                <span className="block text-sm text-muted">{s.translation}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <PracticePanel key={prompt.id} lang={lang} target={null} transcribe={transcribe} onSaveReflection={onSaveReflection} />
      <div className="border-t border-border pt-4">
        <Button variant="ghost" onClick={() => setIndex((i) => i + 1)}>
          <RefreshCw aria-hidden className="size-4" />
          Câu hỏi khác
        </Button>
      </div>
    </SolidCard>
  );
}
