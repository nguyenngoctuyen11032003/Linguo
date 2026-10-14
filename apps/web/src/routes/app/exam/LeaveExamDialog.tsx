import { useId, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { functionalTransition } from '@/design/motion';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';

export interface LeaveExamDialogProps {
  open: boolean;
  /** Timed full mock: the clock keeps running on the server while the learner is away. */
  timed: boolean;
  onStay(): void;
  onLeave(): void;
}

/** "Rời bài thi?": answers are saved and the attempt can be resumed; "Ở lại làm bài" gets focus first. */
export function LeaveExamDialog({ open, timed, onStay, onLeave }: LeaveExamDialogProps) {
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
              Rời bài thi?
            </h2>
            <div id={descriptionId} className="mt-2 space-y-2 text-[15px]">
              <p>Câu trả lời đã được lưu. Bạn có thể quay lại làm tiếp từ mục Luyện thi.</p>
              {timed && <p className="text-muted">Đồng hồ vẫn tiếp tục chạy; hết giờ bài sẽ được nộp tự động.</p>}
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button variant="ghost" size="lg" block onClick={onStay}>
                Ở lại làm bài
              </Button>
              <Button variant="danger" size="lg" block onClick={onLeave}>
                Rời khỏi
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
