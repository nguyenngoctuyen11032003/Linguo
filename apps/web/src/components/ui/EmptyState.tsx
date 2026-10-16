import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SolidCard } from './SolidCard';
import { RouteIllustration } from '@/components/feedback/RouteIllustration';

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
    <SolidCard className="relative isolate flex flex-col items-center gap-3 overflow-hidden px-6 pb-10 pt-7 text-center">
      <span aria-hidden="true" className="pointer-events-none absolute -top-20 left-1/2 -z-10 size-56 -translate-x-1/2 rounded-full bg-radial from-primary/15 to-transparent to-70%" />
      {/* The icon is a stop on a quiet dotted route: nothing here yet, the way on is open. */}
      <div aria-hidden="true" className="relative mb-1 flex h-20 w-56 max-w-full items-center justify-center">
        <RouteIllustration variant="empty" className="absolute inset-x-0 top-1/2 w-full -translate-y-1/2" />
        <span className="relative inline-flex size-16 items-center justify-center rounded-full bg-gradient-to-b from-primary/25 to-primary/5 text-primary shadow-[0_8px_24px_-10px_var(--primary)] ring-1 ring-primary/30 ring-inset backdrop-blur-sm">
          <span className="absolute inset-[3px] rounded-full bg-surface-solid/70" />
          <Icon aria-hidden className="relative size-7" />
        </span>
      </div>
      <Heading className="relative text-xl font-extrabold tracking-[-0.02em]">{title}</Heading>
      <p className="relative max-w-sm text-pretty text-[15px] leading-relaxed text-muted">{description}</p>
      {action}
      {footnote && <div className="text-sm text-muted">{footnote}</div>}
    </SolidCard>
  );
}
