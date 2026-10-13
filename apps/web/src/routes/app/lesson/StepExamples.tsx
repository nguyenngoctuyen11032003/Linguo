import type { LessonBlock } from '@linguo/shared';

type Example = Extract<LessonBlock, { type: 'example' }>;

export function StepExamples({ blocks }: { blocks: LessonBlock[] }) {
  const examples = blocks.filter((b): b is Example => b.type === 'example');
  return (
    <ul className="space-y-3">
      {examples.map((example, i) => (
        <li key={i} className="space-y-1 rounded-2xl border border-border bg-surface-solid p-4">
          <p lang={example.target_lang} className="text-lg font-semibold">
            {example.target}
          </p>
          <p className="text-muted">{example.translation.vi}</p>
          {example.note && <p className="text-[15px]">{example.note.vi}</p>}
        </li>
      ))}
    </ul>
  );
}
