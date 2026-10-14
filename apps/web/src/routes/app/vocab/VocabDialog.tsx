import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { X } from 'lucide-react';
import { functionalTransition } from '@/design/motion';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';

export interface VocabDialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  /** Element that opened the dialog; focus returns there on close. */
  triggerRef?: RefObject<HTMLElement | null>;
  /** Wide dialogs (import preview) use the whole width up to 3xl. */
  wide?: boolean;
  children: ReactNode;
}

/** A modal sheet (bottom sheet on phones, centred card on larger screens) for the personal vocabulary screens. */
export function VocabDialog({ open, title, description, onClose, triggerRef, wide = false, children }: VocabDialogProps) {
  const { reduceMotion } = useMotionPrefs();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalDialog(open, onClose, { containerRef: panelRef, triggerRef });
  const offscreen = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
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
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={offscreen}
            animate={{ opacity: 1, y: 0 }}
            exit={offscreen}
            transition={functionalTransition}
            className={
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border-t border-border bg-surface-solid focus:outline-none sm:rounded-[28px] sm:border ' +
              (wide ? 'max-w-3xl' : 'max-w-md')
            }
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-5">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-bold tracking-[-0.02em]">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-1 text-[15px] text-muted">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-text/5"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
