import { ChevronDown } from 'lucide-react';
import type { LessonBlock } from '@linguo/shared';
import { ForeignText } from '@/components/exercise/ForeignText';
import { lessonLanguage } from '@/components/exercise/machine-speech';

export function StepExplain({ blocks }: { blocks: LessonBlock[] }) {
  const explains = blocks.flatMap((b) => (b.type === 'explain' ? [b.text.vi] : []));
  const deep = blocks.flatMap((b) => (b.type === 'deep_explain' ? [b.text.vi] : []));
  const course = lessonLanguage(blocks);
  return (
    <div className="space-y-4">
      {explains.map((text, i) => (
        <p key={i} className={i === 0 ? 'whitespace-pre-line text-[19px] font-medium leading-relaxed' : 'whitespace-pre-line'}>
          <ForeignText course={course}>{text}</ForeignText>
        </p>
      ))}
      {deep.length > 0 && (
        <details className="card group px-5">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 font-bold [&::-webkit-details-marker]:hidden">
            Giải thích sâu hơn
            <ChevronDown aria-hidden className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 pb-4">
            {deep.map((text, i) => (
              <p key={i} className="whitespace-pre-line">
                <ForeignText course={course}>{text}</ForeignText>
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
