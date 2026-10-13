import { Check, X } from 'lucide-react';
import type { LessonBlock } from '@linguo/shared';

type Mistake = Extract<LessonBlock, { type: 'common_mistake' }>;

export function StepMistake({ blocks }: { blocks: LessonBlock[] }) {
  const mistakes = blocks.filter((b): b is Mistake => b.type === 'common_mistake');
  return (
    <ul className="space-y-3">
      {mistakes.map((mistake, i) => (
        <li key={i} className="space-y-3 rounded-2xl border border-border bg-surface-solid p-4">
          <p className="flex items-start gap-2">
            <X aria-hidden className="mt-1 size-4 shrink-0 text-error" />
            <span className="font-semibold text-error-text">Sai:</span>
            <s lang={mistake.target_lang} className="decoration-error/60">
              {mistake.wrong}
            </s>
          </p>
          <p className="flex items-start gap-2">
            <Check aria-hidden className="mt-1 size-4 shrink-0 text-success" />
            <span className="font-semibold text-success-text">Đúng:</span>
            <span lang={mistake.target_lang} className="font-semibold">
              {mistake.right}
            </span>
          </p>
          <p className="text-[15px] text-muted">{mistake.note.vi}</p>
        </li>
      ))}
    </ul>
  );
}
