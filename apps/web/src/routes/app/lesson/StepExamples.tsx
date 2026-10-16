import type { LessonBlock } from '@linguo/shared';

type Example = Extract<LessonBlock, { type: 'example' }>;

export function StepExamples({ blocks }: { blocks: LessonBlock[] }) {
  const examples = blocks.filter((b): b is Example => b.type === 'example');
  return (
    <ul className="space-y-3">
      {examples.map((example, i) => (
        <li key={i} className="card relative space-y-1.5 overflow-hidden p-5 pl-6 before:absolute before:inset-y-5 before:left-0 before:w-1 before:rounded-r-full before:bg-primary">
          <p lang={example.target_lang} className="text-[21px] font-bold leading-snug">
            {example.target}
          </p>
          <p className="text-muted">{example.translation.vi}</p>
          {example.note && <p className="pt-1 text-[15px]">{example.note.vi}</p>}
        </li>
      ))}
    </ul>
  );
}
