import { useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { SolidCard } from '@/components/ui/SolidCard';
import { cn } from '@/lib/cn';
import { isSectionOpen, SECTION_SCROLL_MARGIN, setSectionOpen, subscribeSections } from './section-state';

interface Props {
  /** Anchor id of the section (target of the jump list). */
  id: string;
  headingId: string;
  title: string;
  /** Classes of the content block under the heading. */
  contentClassName?: string;
  children: ReactNode;
  /** Rendered after the card, e.g. a dialog that must stay visible while the section is collapsed. */
  after?: ReactNode;
}

/**
 * A Settings card whose body folds away behind its heading: a native `<details>` with the section heading inside the
 * `<summary>`, so the toggle is a labelled disclosure button for assistive technology and works without scripting.
 */
export function CollapsibleSection({ id, headingId, title, contentClassName, children, after }: Props) {
  const open = useSyncExternalStore(
    subscribeSections,
    () => isSectionOpen(id),
    () => false,
  );
  return (
    <section id={id} aria-labelledby={headingId} className={SECTION_SCROLL_MARGIN}>
      <SolidCard className="p-0">
        <details open={open} onToggle={(event) => setSectionOpen(id, event.currentTarget.open)} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-3xl px-5 py-3 [&::-webkit-details-marker]:hidden">
            <h2 id={headingId} tabIndex={-1} className="text-lg font-extrabold tracking-[-0.02em] focus:outline-none">
              {title}
            </h2>
            <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-muted">
              <span className="sr-only group-open:hidden">Mở</span>
              <span className="hidden">Thu gọn</span>
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-text/6"><ChevronDown className="size-5 transition-transform group-open:rotate-180" /></span>
            </span>
          </summary>
          <div className={cn('px-5 pb-5', contentClassName)}>{children}</div>
        </details>
      </SolidCard>
      {after}
    </section>
  );
}
