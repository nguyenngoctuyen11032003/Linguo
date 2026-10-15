import { useId, useRef } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { functionalTransition } from '@/design/motion';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';

export interface LeaveRoleplayDialogProps {
  open: boolean;
  onStay(): void;
  onLeave(): void;
}

/** "Bỏ cuộc trò chuyện này?": leaving discards the running chat; "Ở lại trò chuyện" gets focus first. */
export function LeaveRoleplayDialog({ open, onStay, onLeave }: LeaveRoleplayDialogProps) {
  const { reduceMotion } = useMotionPrefs();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalDialog(open, onStay, { containerRef: panelRef });
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
            onClick={onStay}
          />
          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            initial={offscreen}
            animate={{ opacity: 1, y: 0 }}
            exit={offscreen}
            transition={functionalTransition}
            className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-border bg-surface-solid px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-5 focus:outline-none sm:rounded-[28px] sm:border"
          >
            <h2 id={titleId} className="text-lg font-bold">
              Bỏ cuộc trò chuyện này?
            </h2>
            <div id={descriptionId} className="mt-2 space-y-2 text-[15px]">
              <p>Những tin nhắn bạn vừa luyện sẽ bị xoá và không xem lại được.</p>
              <p className="text-muted">Muốn giữ lại những gì đã học? Hãy chọn “Kết thúc và xem tóm tắt” nhé.</p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button variant="ghost" size="lg" block onClick={onStay}>
                Ở lại trò chuyện
              </Button>
              <Button variant="danger" size="lg" block onClick={onLeave}>
                Bỏ và chọn tình huống khác
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
