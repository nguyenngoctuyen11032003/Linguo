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
 * Compact tile: tinted icon, a bold title, one short muted line and one call to action. The button sits below the
 * text on phones (full width, so the copy keeps the whole tile) and to the right from `sm` up.
 */
export function ActionCard({ icon: Icon, titleId, title, description, to, label, variant = 'ghost' }: Props) {
  return (
    <SolidCard className="p-4">
      <section aria-labelledby={titleId} className="flex h-full flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-3 min-[30rem]:flex-row">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary ring-1 ring-primary/20 ring-inset">
            <Icon aria-hidden className="size-[22px]" strokeWidth={2.1} />
          </span>
          <div className="min-w-0 flex-1 break-words">
            <h2 id={titleId} className="text-[17px] font-bold leading-snug tracking-[-0.02em]">
              {title}
            </h2>
            {description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{description}</p>}
          </div>
        </div>
        <Link to={to} className={cn(buttonClasses(variant, 'md'), 'mt-auto w-full max-[30rem]:px-2.5 max-[30rem]:text-sm sm:mt-0 sm:w-auto sm:shrink-0')}>
          {label}
        </Link>
      </section>
    </SolidCard>
  );
}
