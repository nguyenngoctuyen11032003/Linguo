import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { functionalTransition } from '@/design/motion';
import { cn } from '@/lib/cn';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';

export interface AiModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Optional line under the title, linked as the dialog's description. */
  description?: ReactNode;
  /** Header content shown at the end of the title row (e.g. the quota chip). */
  headerExtra?: ReactNode;
  children: ReactNode;
  /** `sheet`: bottom sheet on phones, centred card ≥ sm. `panel`: bottom sheet on phones, right side panel ≥ md. */
  layout?: 'sheet' | 'panel';
  /** Stacked above another AI modal (e.g. report over the explain panel). */
  stacked?: boolean;
  /**
   * When false the modal stays on screen but releases keyboard handling (Escape, Tab trap, focus) to a modal
   * stacked above it.
   */
  active?: boolean;
  triggerRef?: RefObject<HTMLElement | null>;
  /** Accessible role; `alertdialog` for confirmations that need an answer. */
  role?: 'dialog' | 'alertdialog';
}

/** Shared shell of the AI dialogs: scrim, focus trap, Escape, scroll lock, reduced motion. */
export function AiModal({
  open,
  onClose,
  title,
  description,
  headerExtra,
  children,
  layout = 'sheet',
  stacked = false,
  active = true,
  triggerRef,
  role = 'dialog',
}: AiModalProps) {
  const { reduceMotion } = useMotionPrefs();
  const wide = useMediaQuery('(min-width: 768px)');
  const panelRef = useRef<HTMLDivElement>(null);
  // The element focused when the modal opened: focus returns there even if keyboard handling was handed to a
  // stacked modal in between (which would otherwise make the stacked modal's trigger the return target).
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    openerRef.current = triggerRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }, [open, triggerRef]);

  useModalDialog(open && active, onClose, { triggerRef: openerRef, containerRef: panelRef });

  const side = layout === 'panel' && wide;
  const offscreen = reduceMotion ? { opacity: 0 } : side ? { x: '100%' } : { y: '100%' };
  const onscreen = side ? { x: 0, opacity: 1 } : { y: 0, opacity: 1 };

  return (
    <AnimatePresence>
      {open && (
        <div className={cn('fixed inset-0', stacked ? 'z-[60]' : 'z-50')}>
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
            role={role}
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={offscreen}
            animate={onscreen}
            exit={offscreen}
            transition={{ ...functionalTransition, duration: 0.28 }}
            className={cn(
              'absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] max-w-xl flex-col overflow-hidden rounded-t-[2rem] border-t border-border bg-surface-solid shadow-[var(--card-sheen),var(--shadow-dock)] focus:outline-none',
              layout === 'panel'
                ? 'md:inset-y-0 md:left-auto md:right-0 md:mx-0 md:max-h-none md:w-[min(30rem,100%)] md:max-w-none md:rounded-none md:rounded-l-[28px] md:border-l md:border-t-0'
                : 'sm:bottom-6 sm:rounded-[2rem] sm:border',
            )}
          >
            <div className="shrink-0 px-safe pt-3">
              <div aria-hidden="true" className={cn('mx-auto mb-3 h-1.5 w-10 rounded-full bg-text/20', layout === 'panel' && 'md:hidden')} />
              <div className={cn('flex items-start justify-between gap-3', layout === 'panel' && 'md:pt-4')}>
                <h2 id={titleId} className="min-w-0 text-[19px] font-extrabold leading-snug tracking-[-0.02em]">
                  {title}
                </h2>
                {headerExtra}
              </div>
              {description && (
                <div id={descriptionId} className="mt-1 text-[15px] text-muted">
                  {description}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-safe pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-4">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
