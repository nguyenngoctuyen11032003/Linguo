import type { Ref } from 'react';
import { LayoutGrid, type LucideIcon } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { cn } from '@/lib/cn';
import { MORE_NAV, PRIMARY_NAV } from './nav';

const TAB = 'group flex min-h-14 w-full flex-col items-center justify-center gap-1 whitespace-nowrap px-0.5 text-xs font-semibold leading-tight transition-colors';

/** Icon in a pill that fills when active; the label shows only for the active tab (always read by screen readers). */
function TabFace({ icon: Icon, label, active }: { icon: LucideIcon; label: string; active: boolean }) {
  return (
    <>
      <span
        className={cn(
          'inline-flex h-8 w-12 items-center justify-center rounded-full transition-[background-color,color,scale] duration-200',
          active ? 'bg-primary text-on-primary' : 'text-muted group-hover:text-text group-active:scale-90',
        )}
      >
        <Icon aria-hidden className="size-[22px]" strokeWidth={active ? 2.4 : 1.9} />
      </span>
      <span className={active ? 'text-text' : 'sr-only'}>{label}</span>
    </>
  );
}

export function BottomNav({
  onMore,
  moreOpen = false,
  moreTriggerRef,
  className,
}: {
  onMore: () => void;
  /** Whether the "Thêm" sheet is open (exposed as aria-expanded). */
  moreOpen?: boolean;
  /** Lets the sheet return focus to the "Thêm" button when it closes. */
  moreTriggerRef?: Ref<HTMLButtonElement>;
  className?: string;
}) {
  const { pathname } = useLocation();
  const moreActive = MORE_NAV.some((item) => pathname.startsWith(item.to));
  return (
    <nav
      aria-label="Điều hướng chính"
      className={cn('vt-dock pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]', className)}
    >
      <ul className="glass pointer-events-auto mx-auto grid max-w-md grid-cols-5 rounded-[1.75rem] px-1 py-1 shadow-[var(--shadow-dock)]">
        {PRIMARY_NAV.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className={TAB}>
              {({ isActive }) => <TabFace icon={item.icon} label={item.label} active={isActive} />}
            </NavLink>
          </li>
        ))}
        <li>
          <button
            ref={moreTriggerRef}
            type="button"
            onClick={onMore}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={TAB}
          >
            <TabFace icon={LayoutGrid} label="Thêm" active={moreActive} />
          </button>
        </li>
      </ul>
    </nav>
  );
}
