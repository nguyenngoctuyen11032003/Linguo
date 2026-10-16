import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SolidCard } from './SolidCard';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  footnote?: ReactNode;
  headingLevel?: 'h2' | 'h3';
}

export function EmptyState({ icon: Icon, title, description, action, footnote, headingLevel = 'h2' }: EmptyStateProps) {
  const Heading = headingLevel;
  return (
    <SolidCard className="relative flex flex-col items-center gap-3 overflow-hidden px-6 py-10 text-center">
      <span aria-hidden="true" className="pointer-events-none absolute -top-20 left-1/2 size-56 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <span className="relative mb-1 inline-flex size-16 items-center justify-center rounded-full bg-gradient-to-b from-primary/25 to-primary/5 text-primary ring-1 ring-primary/25 ring-inset">
        <span aria-hidden="true" className="absolute -inset-2 rounded-full border border-dashed border-primary/25" />
        <Icon aria-hidden className="size-7" />
      </span>
      <Heading className="relative text-xl font-extrabold tracking-[-0.02em]">{title}</Heading>
      <p className="relative max-w-sm text-[15px] leading-relaxed text-muted">{description}</p>
      {action}
      {footnote && <div className="text-sm text-muted">{footnote}</div>}
    </SolidCard>
  );
}
