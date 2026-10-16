import { useId, useRef, type RefObject } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { functionalTransition } from '@/design/motion';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';

export interface PostponeAllDialogProps {
  open: boolean;
  /** Cards still in the queue, including the one on screen. */
  count: number;
  onKeep: () => void;
  onConfirm: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
}

/** "Hoãn tất cả" moves the whole rest of the queue to tomorrow, so it asks first; "Giữ lại" gets focus. */
export function PostponeAllDialog({ open, count, onKeep, onConfirm, triggerRef }: PostponeAllDialogProps) {
  const { reduceMotion } = useMotionPrefs();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalDialog(open, onKeep, { triggerRef, containerRef: panelRef });
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
            onClick={onKeep}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            initial={offscreen}
            animate={{ opacity: 1, y: 0 }}
            exit={offscreen}
            transition={functionalTransition}
            className="relative w-full max-w-md rounded-t-[2rem] border-t border-border bg-surface-solid px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-5 shadow-[var(--shadow-dock)] focus:outline-none sm:rounded-[2rem] sm:border"
          >
            <h2 id={titleId} className="font-display text-[28px] font-extrabold uppercase leading-none">
              Hoãn {count} thẻ còn lại?
            </h2>
            <p id={descriptionId} className="mt-2 text-[15px]">
              Các thẻ này sẽ chuyển sang ngày mai, không mất gì cả. Bạn vẫn ôn lại được khi sẵn sàng.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button variant="ghost" size="lg" block onClick={onKeep}>
                Giữ lại
              </Button>
              <Button variant="primary" size="lg" block onClick={onConfirm}>
                Hoãn {count} thẻ
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
