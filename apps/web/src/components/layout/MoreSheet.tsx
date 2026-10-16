import { useEffect, useId, useRef, type RefObject } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { ChevronRight, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { functionalTransition } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { MORE_NAV } from './nav';
import { useTeacherNav } from '@/features/teacher/useTeacherNav';

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
  const teacherNav = useTeacherNav();
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
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
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
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[2rem] border-t border-border bg-surface-solid px-safe shadow-[0_-20px_60px_-20px_rgb(0_0_0/0.5)] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-3"
          >
            <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-text/20" />
            <div className="flex items-center justify-between">
              <h2 id={titleId} className="font-display text-[32px] font-extrabold uppercase leading-none">
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
            <ul className="mt-3 grid grid-cols-2 gap-2.5">
              {[...MORE_NAV, ...teacherNav].map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'flex h-full min-h-24 flex-col justify-between gap-3 rounded-[1.25rem] p-3.5 text-[15px] font-bold leading-snug ring-1 ring-inset transition-colors',
                        isActive ? 'bg-primary/12 text-primary ring-primary/30' : 'bg-text/[0.04] ring-border hover:bg-text/8',
                      )
                    }
                  >
                    <span className="flex items-center justify-between">
                      <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                        <item.icon aria-hidden className="size-5" />
                      </span>
                      <ChevronRight aria-hidden className="size-4 text-muted" />
                    </span>
                    <span>{item.label}</span>
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
