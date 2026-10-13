import { ChevronDown } from 'lucide-react';
import type { LessonBlock } from '@linguo/shared';

export function StepExplain({ blocks }: { blocks: LessonBlock[] }) {
  const explains = blocks.flatMap((b) => (b.type === 'explain' ? [b.text.vi] : []));
  const deep = blocks.flatMap((b) => (b.type === 'deep_explain' ? [b.text.vi] : []));
  return (
    <div className="space-y-4">
      {explains.map((text, i) => (
        <p key={i} className="whitespace-pre-line">
          {text}
        </p>
      ))}
      {deep.length > 0 && (
        <details className="group rounded-2xl border border-border bg-surface-solid px-4">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden">
            Giải thích sâu hơn
            <ChevronDown aria-hidden className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 pb-4">
            {deep.map((text, i) => (
              <p key={i} className="whitespace-pre-line">
                {text}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
