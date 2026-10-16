import type { LessonBlock } from '@linguo/shared';
import { ForeignText } from '@/components/exercise/ForeignText';
import { SpeakButton } from '@/components/exercise/SpeakButton';

type Example = Extract<LessonBlock, { type: 'example' }>;

export function StepExamples({ blocks }: { blocks: LessonBlock[] }) {
  const examples = blocks.filter((b): b is Example => b.type === 'example');
  return (
    <ul className="space-y-3">
      {examples.map((example, i) => (
        <li key={i} className="card relative space-y-1.5 overflow-hidden p-5 pl-6 before:absolute before:inset-y-5 before:left-0 before:w-1 before:rounded-r-full before:bg-primary">
          <div className="flex items-start justify-between gap-3">
            <p lang={example.target_lang} className="min-w-0 text-[21px] font-bold leading-snug break-words">
              {example.target}
            </p>
            <SpeakButton text={example.target} lang={example.target_lang} label="Nghe câu ví dụ" />
          </div>
          <p className="text-muted">{example.translation.vi}</p>
          {example.note && (
            <p className="pt-1 text-[15px]">
              <ForeignText course={example.target_lang}>{example.note.vi}</ForeignText>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
