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
    <SolidCard className="flex flex-col items-center gap-4 px-6 py-10 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <Icon aria-hidden className="size-7" />
      </span>
      <Heading className="text-xl font-bold tracking-[-0.02em]">{title}</Heading>
      <p className="max-w-sm text-[15px] leading-relaxed text-muted">{description}</p>
      {action}
      {footnote && <div className="text-sm text-muted">{footnote}</div>}
    </SolidCard>
  );
}
