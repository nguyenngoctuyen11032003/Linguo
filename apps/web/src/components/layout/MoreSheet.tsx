import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, X } from 'lucide-react';
import { NavLink } from 'react-router';
import { functionalTransition } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { MORE_NAV } from './nav';

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reduceMotion } = useMotionPrefs();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('button, a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose]);

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
            initial={offscreen}
            animate={{ y: 0, opacity: 1 }}
            exit={offscreen}
            transition={{ ...functionalTransition, duration: 0.28 }}
            className="absolute inset-x-0 bottom-0 overscroll-contain rounded-t-[28px] border-t border-border bg-surface-solid px-safe pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-3"
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
