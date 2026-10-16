import { Check, X } from 'lucide-react';
import type { LessonBlock } from '@linguo/shared';
import { ForeignText } from '@/components/exercise/ForeignText';
import { SpeakButton } from '@/components/exercise/SpeakButton';

type Mistake = Extract<LessonBlock, { type: 'common_mistake' }>;

export function StepMistake({ blocks }: { blocks: LessonBlock[] }) {
  const mistakes = blocks.filter((b): b is Mistake => b.type === 'common_mistake');
  return (
    <ul className="space-y-3">
      {mistakes.map((mistake, i) => (
        <li key={i} className="card space-y-2.5 p-4">
          <p className="flex items-start gap-2 rounded-2xl bg-error/8 px-3 py-2.5">
            <X aria-hidden className="mt-1 size-4 shrink-0 text-error" />
            <span className="font-semibold text-error-text">Sai:</span>
            <s lang={mistake.target_lang} className="decoration-error/60">
              {mistake.wrong}
            </s>
          </p>
          <p className="flex items-start gap-2 rounded-2xl bg-success/10 px-3 py-2.5">
            <Check aria-hidden className="mt-1 size-4 shrink-0 text-success" />
            <span className="font-semibold text-success-text">Đúng:</span>
            <span lang={mistake.target_lang} className="min-w-0 flex-1 font-semibold">
              {mistake.right}
            </span>
            <SpeakButton text={mistake.right} lang={mistake.target_lang} label="Nghe cách nói đúng" size="sm" className="-my-1" />
          </p>
          <p className="px-1 text-[15px] text-muted">
            <ForeignText course={mistake.target_lang}>{mistake.note.vi}</ForeignText>
          </p>
        </li>
      ))}
    </ul>
  );
}
