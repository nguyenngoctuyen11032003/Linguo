import { useId, useRef } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { CheckCircle2, CircleDashed, Flag } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { functionalTransition } from '@/design/motion';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';

export interface SubmitDialogProps {
  open: boolean;
  unanswered: number;
  flagged: number;
  onConfirm(): void;
  /** Also called on Escape and on a backdrop click. */
  onCancel(): void;
}

/** "Nộp bài?" confirmation: focus-trapped, Escape cancels, "Làm tiếp" gets focus first so Enter is safe. */
export function SubmitDialog({ open, unanswered, flagged, onConfirm, onCancel }: SubmitDialogProps) {
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
              Nộp bài?
            </h2>
            <div id={descriptionId} className="mt-2 space-y-2 text-[15px]">
              {unanswered === 0 ? (
                <p className="flex items-center gap-2">
                  <CheckCircle2 aria-hidden className="size-5 shrink-0 text-success-text" />
                  Bạn đã trả lời tất cả câu hỏi.
                </p>
              ) : (
                <p className="flex items-center gap-2">
                  <CircleDashed aria-hidden className="size-5 shrink-0 text-muted" />
                  Còn {unanswered} câu chưa trả lời.
                </p>
              )}
              {flagged > 0 && (
                <p className="flex items-center gap-2">
                  <Flag aria-hidden className="size-5 shrink-0 fill-current text-gold" />
                  {flagged} câu đang đánh dấu xem lại.
                </p>
              )}
              <p className="text-muted">Sau khi nộp, bạn không sửa được câu trả lời nữa.</p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button variant="ghost" size="lg" block onClick={onCancel}>
                Làm tiếp
              </Button>
              <Button variant="accent" size="lg" block onClick={onConfirm}>
                Nộp bài
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
