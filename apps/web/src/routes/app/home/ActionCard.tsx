import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { buttonClasses, type ButtonVariant } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { cn } from '@/lib/cn';

interface Props {
  icon: LucideIcon;
  titleId: string;
  title: ReactNode;
  description?: ReactNode;
  to: string;
  label: string;
  variant?: ButtonVariant;
}

/**
 * Icon + text + one call to action. The text always gets the full width beside the icon; the button sits below it on
 * phones (full width, so the card never squeezes the copy into a thin column) and to the right from `sm` up.
 */
export function ActionCard({ icon: Icon, titleId, title, description, to, label, variant = 'ghost' }: Props) {
  return (
    <SolidCard>
      <section aria-labelledby={titleId} className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Icon aria-hidden className="size-6" />
          </span>
          <div className="min-w-0 flex-1 break-words">
            <h2 id={titleId} className="text-lg font-bold tracking-[-0.02em]">
              {title}
            </h2>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
        </div>
        <Link to={to} className={cn(buttonClasses(variant, 'md'), 'w-full sm:w-auto sm:shrink-0')}>
          {label}
        </Link>
      </section>
    </SolidCard>
  );
}
