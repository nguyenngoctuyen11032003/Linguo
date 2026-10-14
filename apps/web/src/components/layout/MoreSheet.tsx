import { useEffect, useId, useRef, type RefObject } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { ChevronRight, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { functionalTransition } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { MORE_NAV } from './nav';

export function MoreSheet({
  open,
  onClose,
  triggerRef,
}: {
  open: boolean;
  onClose: () => void;
  /** The "Thêm" button; focus returns to it on close (falls back to the element focused on open). */
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const { reduceMotion } = useMotionPrefs();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { pathname } = useLocation();
  const lastPathname = useRef(pathname);

  useModalDialog(open, onClose, { triggerRef, containerRef: panelRef });

  // Close when the route changes underneath the sheet (browser back, a link elsewhere on the page).
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    if (open) onClose();
  }, [pathname, open, onClose]);

  const offscreen = reduceMotion ? { opacity: 0 } : { y: '100%' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={functionalTransition}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={offscreen}
            animate={{ y: 0, opacity: 1 }}
            exit={offscreen}
            transition={{ ...functionalTransition, duration: 0.28 }}
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-border bg-surface-solid px-safe pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-3"
          >
            <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-text/20" />
            <div className="flex items-center justify-between">
              <h2 id={titleId} className="text-lg font-bold">
                Thêm
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-text/5 hover:text-text"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {MORE_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn('flex min-h-13 items-center gap-3 rounded-2xl px-3 text-[16px] font-medium', isActive ? 'bg-primary/12 text-primary' : 'hover:bg-text/5')
                    }
                  >
                    <item.icon aria-hidden className="size-5" />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight aria-hidden className="size-4 text-muted" />
                  </NavLink>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
