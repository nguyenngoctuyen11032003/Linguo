import { useId, useRef, type RefObject } from 'react';
import { Save } from 'lucide-react';
import { AnimatePresence, m as motion } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { functionalTransition } from '@/design/motion';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';

interface Props {
  open: boolean;
  onClose: () => void;
  onExit: () => void;
  /** Attempts still waiting in the offline outbox. */
  pendingCount: number;
  triggerRef?: RefObject<HTMLElement | null>;
}

/** Bottom sheet confirming that leaving keeps the learner's progress. */
export function ExitSheet({ open, onClose, onExit, pendingCount, triggerRef }: Props) {
  const { reduceMotion } = useMotionPrefs();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalDialog(open, onClose, { triggerRef, containerRef: panelRef });

  const offscreen = reduceMotion ? { opacity: 0 } : { y: '100%' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
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
            aria-describedby={descriptionId}
            tabIndex={-1}
            initial={offscreen}
            animate={{ y: 0, opacity: 1 }}
            exit={offscreen}
            transition={{ ...functionalTransition, duration: 0.28 }}
            className="absolute inset-x-0 bottom-0 mx-auto max-w-xl rounded-t-[2rem] border-t border-border bg-surface-solid px-safe pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-[var(--shadow-dock)] sm:bottom-6 sm:rounded-[2rem] sm:border"
          >
            <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-text/20" />
            <span aria-hidden="true" className="mb-3 grid size-12 place-items-center rounded-2xl bg-success/12 text-success-text">
              <Save className="size-6" />
            </span>
            <h2 id={titleId} className="font-display text-[28px] font-extrabold uppercase leading-none">
              Tiến độ đã được lưu
            </h2>
            <div id={descriptionId} className="mt-2 space-y-1 text-[15px] text-muted">
              <p>Lần sau bạn sẽ học tiếp từ đúng bước đang dừng.</p>
              {pendingCount > 0 && <p>Còn {pendingCount} câu đang chờ đồng bộ — sẽ được chấm khi có mạng.</p>}
            </div>
            <div className="mt-5 grid gap-2">
              <Button variant="accent" size="lg" block onClick={onClose}>
                Học tiếp
              </Button>
              <Button variant="ghost" size="lg" block onClick={onExit}>
                Thoát
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
