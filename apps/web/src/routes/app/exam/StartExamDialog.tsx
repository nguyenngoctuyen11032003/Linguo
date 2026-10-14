import { useId, useRef } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { functionalTransition } from '@/design/motion';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';

export interface StartExamDialogProps {
  open: boolean;
  /** Total minutes of the timed full mock; the server clock starts as soon as the attempt is created. */
  minutes: number;
  /** The form title, so the learner knows which mock is about to start. */
  title?: string;
  busy?: boolean;
  onCancel(): void;
  onConfirm(): void;
}

/** "Bắt đầu thi thử?": asked before a TIMED attempt only; "Để sau" gets focus first (the safe choice). */
export function StartExamDialog({ open, minutes, title, busy = false, onCancel, onConfirm }: StartExamDialogProps) {
  const { reduceMotion } = useMotionPrefs();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalDialog(open, onCancel, { containerRef: panelRef });
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
            onClick={onCancel}
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
            className="relative w-full max-w-md rounded-t-[28px] border-t border-border bg-surface-solid px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-5 focus:outline-none sm:rounded-[28px] sm:border"
          >
            <h2 id={titleId} className="text-lg font-bold">
              Bắt đầu thi thử?
            </h2>
            <div id={descriptionId} className="mt-2 space-y-2 text-[15px]">
              <p>
                Đồng hồ {minutes} phút chạy ngay và vẫn chạy nếu bạn thoát.
              </p>
              {title && <p className="break-words text-muted">{title}</p>}
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button variant="ghost" size="lg" block onClick={onCancel}>
                Để sau
              </Button>
              <Button variant="primary" size="lg" block disabled={busy} onClick={onConfirm}>
                Bắt đầu
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
