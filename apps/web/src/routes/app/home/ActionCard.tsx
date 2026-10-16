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
  /** Visual label for the narrow two-up tile (380–639px); `label` stays the link's accessible name. */
  shortLabel?: string;
  variant?: ButtonVariant;
}

/**
 * Compact tile: a bare line icon, a bold title, one short muted line and one call to action. The button sits below
 * the text on phones (full width, so the copy keeps the whole tile) and to the right from `sm` up.
 */
export function ActionCard({ icon: Icon, titleId, title, description, to, label, shortLabel, variant = 'ghost' }: Props) {
  return (
    <SolidCard className="p-4">
      <section aria-labelledby={titleId} className="flex h-full flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5 min-[30rem]:flex-row min-[30rem]:gap-3.5">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary min-[30rem]:size-11">
            <Icon aria-hidden className="size-5 min-[30rem]:size-[22px]" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1 break-words">
            <h2 id={titleId} className="text-[16px] font-bold leading-snug tracking-[-0.015em] min-[30rem]:text-[17px]">
              {title}
            </h2>
            {description && <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-muted sm:line-clamp-2">{description}</p>}
          </div>
        </div>
        <Link
          to={to}
          className={cn(buttonClasses(variant, 'md'), 'mt-auto w-full whitespace-nowrap max-[30rem]:px-3 max-[30rem]:text-sm sm:mt-0 sm:w-auto sm:shrink-0')}
        >
          {shortLabel ? (
            <>
              <span className="min-[380px]:max-sm:sr-only">{label}</span>
              <span aria-hidden="true" className="hidden min-[380px]:max-sm:inline">
                {shortLabel}
              </span>
            </>
          ) : (
            label
          )}
        </Link>
      </section>
    </SolidCard>
  );
}
