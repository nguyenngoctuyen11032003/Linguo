import type { Ref } from 'react';
import { LayoutGrid } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { cn } from '@/lib/cn';
import { MORE_NAV, PRIMARY_NAV } from './nav';

const TAB = 'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium leading-tight transition-colors';

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
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-solid/90 pb-safe backdrop-blur-md',
        className,
      )}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {PRIMARY_NAV.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className={({ isActive }) => cn(TAB, isActive ? 'text-primary' : 'text-muted')}>
              {({ isActive }) => (
                <>
                  <item.icon aria-hidden className="size-6" strokeWidth={isActive ? 2.4 : 1.8} />
                  <span>{item.label}</span>
                </>
              )}
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
            className={cn(TAB, moreActive ? 'text-primary' : 'text-muted')}>
            <LayoutGrid aria-hidden className="size-6" strokeWidth={moreActive ? 2.4 : 1.8} />
            <span>Thêm</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
